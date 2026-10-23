import stats from './generated-data.mjs';
import { validateInput, candidates, modelRequest, safeAnswer, reserve } from './logic.mjs';
import {validateChatInput,chatRequest,chatResponse,recoverChat} from './chat.mjs';
const message=(code)=>({closed:'AI-guidens projektgräns är nådd eller guiden är pausad. Uträknaren fungerar fortfarande.',busy:'AI-guiden är upptagen. Vänta en liten stund.',rate:'Du har ställt många frågor. Vänta en stund eller återkom i morgon.'}[code]);
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function limitedText(request, max) {
  const reader=request.body?.getReader(); if (!reader) throw Error('Tom fråga.');
  const parts=[]; let length=0;
  while (true) { const {done,value}=await reader.read(); if (done) break; length+=value.byteLength; if(length>max){await reader.cancel();throw Error('För stor fråga.');} parts.push(value); }
  const all=new Uint8Array(length);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}
  return new TextDecoder().decode(all);
}
export function configured(env) {
  return env.BOT_ENABLED==='true' && env.OPENAI_API_KEY && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY && env.RATE_LIMIT_SALT?.length>=32 && env.BOT_GATE;
}
async function hash(value,salt) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(salt),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN) return json({error:'Otillåten begäran.'},403);
    const headers={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Vary':'Origin'};
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    const path=new URL(request.url).pathname;
    if (path==='/config' && request.method==='GET') return json({enabled:!!configured(env),siteKey:configured(env)?env.TURNSTILE_SITE_KEY:null},200,headers);
    if (path!=='/chat' || request.method!=='POST') return json({error:'Hittades inte.'},404,headers);
    if (!configured(env)) return json({error:'AI-guiden är pausad. Använd uträknaren och områdesförslagen.'},503,headers);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Fel format.'},415,headers);
    let input;
    try { const body=JSON.parse(await limitedText(request,8192));input=body.mode==='chat'?validateChatInput(body):validateInput(body,stats); } catch(e) { return json({error:e.message},400,headers); }
    // Cloudflare overwrites this header; never trust an IP supplied in the JSON body.
    const ip=request.headers.get('CF-Connecting-IP');
    if (!ip || ip.length>64) return json({error:'Kunde inte kontrollera begäran.'},403,headers);
    try {
      const proof=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:input.token,remoteip:ip}),signal:AbortSignal.timeout(8000)});
      if (!proof.ok) throw Error('turnstile');
      const result=await proof.json();
      if (!result.success || result.hostname!==new URL(env.ALLOWED_ORIGIN).hostname || result.action!=='portunus-chat') return json({error:'Robotkontrollen misslyckades. Gör om den.'},403,headers);
      const day=Math.floor(Date.now()/86400000);
      const ipHash=await hash(day+':'+ip,env.RATE_LIMIT_SALT);
      const sessionHash=await hash(day+':'+input.session,env.RATE_LIMIT_SALT);
      const stub=env.BOT_GATE.get(env.BOT_GATE.idFromName('portunus-lifetime-v1'));
      const response=await stub.fetch(new Request('https://internal/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,ipHash,sessionHash})}));
      return new Response(response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),...headers}});
    } catch { return json({error:'AI-guiden kunde inte nås. Försök igen senare.'},503,headers); }
  }
};
export class BotGate {
  constructor(state,env) { this.state=state; this.env=env; }
  async fetch(request) {
    const {input,ipHash,sessionHash}=await request.json();
    let reservation;
    try {
      reservation=await this.state.storage.transaction(tx=>reserve(tx,ipHash,sessionHash));
      if (!reservation.ok) return json({error:message(reservation.code)},reservation.code==='closed'?503:429);
      if (!await this.state.storage.getAlarm()) await this.state.storage.setAlarm(Date.now()+3600000);
    } catch { return json({error:'AI-guiden är pausad eftersom användningsgränsen inte kunde kontrolleras.'},503); }
    try {
      const chat=input.mode==='chat';
      const cards=chat?[]:candidates(input,stats);
      // Exactly one paid request per reservation: no automatic retries or tool loops.
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+this.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(chat?chatRequest(input,stats):modelRequest(input,stats,cards)),signal:AbortSignal.timeout(25000)});
      if (!response.ok) {
        const error=await response.json().catch(()=>({}));
        if (response.status===401 || ['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded'].includes(error.error?.code)) {
          await this.state.storage.transaction(async tx=>{const g=await tx.get('global');await tx.put('global',{...g,paused:true});});
        }
        return json({error:'AI-guiden är tillfälligt pausad eller kunde inte svara. Använd uträknaren.'},503);
      }
      if (chat) {
        try {
          let result;
          try { result=await response.json(); } catch { throw Object.assign(Error('Ogiltigt svarsformat.'),{code:'invalid_model_json'}); }
          return json({...chatResponse(result,stats),year:2025,source:stats.kalla});
        } catch(error) { return json({...recoverChat(input,stats,error.code),year:2025,source:stats.kalla}); }
      }
      const result=await response.json();
      return json({answer:safeAnswer(result),cards,year:2025,source:stats.kalla});
    } catch(error) { return json({error:error?.name==='TimeoutError'?'AI-tjänsten svarade inte i tid. Försök igen senare.':'AI-svaret kunde inte slutföras. Uträknaren och områdesförslagen fungerar fortfarande.'},503); }
    finally {
      // Reservation is never refunded: a failed/aborted request may still have cost money.
      try { await this.state.storage.transaction(async tx=>{const g=await tx.get('global');await tx.put('global',{...g,leases:g.leases.filter(x=>x.id!==reservation.id)});}); } catch { /* Lease expires; no new usage allowed if storage is unavailable. */ }
    }
  }
  async alarm() {
    let after, live=false;
    while (true) {
      const entries=await this.state.storage.list({prefix:'rate:',limit:500,...(after?{startAfter:after}:{})});
      if (!entries.size) break;
      for(const [key,value] of entries) { if(value.expires<Date.now()) await this.state.storage.delete(key); else live=true; after=key; }
      if(entries.size<500) break;
    }
    if(live) await this.state.storage.setAlarm(Date.now()+3600000);
  }
}
