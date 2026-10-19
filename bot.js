(function () {
  'use strict';
  var toggle = document.getElementById('bot-toggle');
  var panel = document.getElementById('bot-panel');
  var status = document.getElementById('bot-status');
  var botForm = document.getElementById('bot-form');
  var log = document.getElementById('bot-log');
  var send = document.getElementById('bot-send');
  var reset = document.getElementById('bot-reset');
  var history = [], turns = [], currentTurn = null;
  var token = '', widget = null, endpoint = '', loading = false, initPromise = null;
  var session = crypto.randomUUID();
  try { session = sessionStorage.getItem('portunus-bot-session') || session; sessionStorage.setItem('portunus-bot-session', session); } catch (_) {}
  function entry(role, value) {
    var box = document.createElement('div'); box.className = 'bot-message' + (role === 'Du' ? ' bot-message-user' : '');
    var title = document.createElement('strong'); title.textContent = role;
    var text = document.createElement('p'); text.textContent = value;
    box.append(title, text); (currentTurn || log).append(box);
  }
  async function initialise() {
    try {
      var configured = window.PORTUNUS_BOT && window.PORTUNUS_BOT.endpoint;
      var url = new URL(configured);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('config');
      endpoint = url.origin;
      var response = await fetch(endpoint + '/config', { signal: AbortSignal.timeout(10000), credentials: 'omit' });
      if (!response.ok) throw Error('offline');
      var config = await response.json();
      if (!config.enabled || !config.siteKey) throw Error('paused');
      await new Promise(function (resolve, reject) {
        var script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true; script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      widget = window.turnstile.render('#bot-challenge', {
        sitekey: config.siteKey, action: 'portunus-chat',
        callback: function (value) { token = value; send.disabled = loading; status.textContent = 'Du kan nu ställa din fråga.'; },
        'expired-callback': function () { token = ''; send.disabled = true; status.textContent = 'Gör om robotkontrollen för att fråga igen.'; },
        'error-callback': function () { token = ''; send.disabled = true; status.textContent = 'Robotkontrollen kunde inte slutföras. Försök igen senare.'; }
      });
      status.textContent = 'Slutför robotkontrollen för att ställa en fråga.';
    } catch (_) {
      endpoint = ''; status.textContent = 'AI-guiden är inte tillgänglig just nu. Uträknaren och områdesförslagen fungerar fortfarande.';
    }
  }
  toggle.addEventListener('click', function () {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.textContent = panel.hidden ? 'Fråga Portunus – AI-guide' : 'Stäng AI-guiden';
    if (!panel.hidden && !initPromise) initPromise = initialise();
  });
  reset.addEventListener('click', function () {
    if (loading) return;
    history = []; turns = []; currentTurn = null; log.replaceChildren();
    document.getElementById('bot-question').value = '';
    status.textContent = 'Ny chatt. Beskriv var du vill bo, din kötid och eventuell maxhyra.';
  });
  botForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (loading || !endpoint || !token || !botForm.reportValidity()) return;
    var question = document.getElementById('bot-question').value.trim();
    if (!question) return;
    // Keep only a small recent conversation, in memory; never read calculator values.
    var recent = history.slice(-4);
    while (recent.length && new TextEncoder().encode(JSON.stringify(recent)).length > 4000) recent.shift();
    var body = { mode: 'chat', question: question, session: session, token: token, history: recent, consent: document.getElementById('bot-consent').checked };
    while (body.history.length && new TextEncoder().encode(JSON.stringify(body)).length > 8000) body.history.shift();
    loading = true; send.disabled = true; reset.disabled = true; panel.setAttribute('aria-busy', 'true'); status.textContent = 'Portunus arbetar med ditt svar…';
    currentTurn = document.createElement('div'); currentTurn.className = 'bot-turn';
    log.append(currentTurn); turns.push(currentTurn);
    if (turns.length > 3) turns.shift().remove();
    entry('Du', question);
    log.scrollTop = log.scrollHeight;
    try {
      var response = await fetch(endpoint + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
      var result = await response.json();
      if (!response.ok) throw Error(result.error || 'AI-guiden kunde inte svara. Försök igen senare.');
      if (typeof result.answer !== 'string' || !Array.isArray(result.cards)) throw Error('Svaret kunde inte visas.');
      entry('Portunus', result.answer);
      history.push({ role: 'user', content: question }, { role: 'assistant', content: ((result.search ? 'Bekräftade sökval: ' + JSON.stringify(result.search) + '\n' : '') + result.answer).slice(0, 1600) });
      history = history.slice(-4);
      document.getElementById('bot-question').value = '';
      log.scrollTop = log.scrollHeight;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'Svaret tog för lång tid. Inget nytt försök skickas automatiskt.' : error.message;
    } finally {
      loading = false; token = ''; send.disabled = true; reset.disabled = false; panel.setAttribute('aria-busy', 'false');
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });
})();
