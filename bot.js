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
    var box = document.createElement('div'); box.className = 'bot-message';
    var title = document.createElement('strong'); title.textContent = role;
    var text = document.createElement('p'); text.textContent = value;
    box.append(title, text); (currentTurn || log).append(box);
  }
  function cards(items) {
    items.slice(0, 3).forEach(function (item) {
      // All values originate in the backend's bundled statistics, never in AI prose.
      var box = document.createElement('article'); box.className = 'bot-card';
      var heading = document.createElement('h3'); heading.textContent = item.area + ' – ' + item.municipality;
      var text = document.createElement('p'); text.textContent = (item.reason ? item.reason + '. ' : '') + item.type + ': ' + new Intl.NumberFormat('sv-SE').format(item.rent) + ' kr/mån i snitt. Kötid: ' + item.queue + ' år. Beräknat kvar: ' + item.remaining + ' år.';
      var comparison = document.createElement('p');
      var money = function (value) { return new Intl.NumberFormat('sv-SE').format(value); };
      if (Number.isFinite(item.budgetMargin) && Number.isFinite(item.queueMargin)) {
        comparison.textContent = money(item.budgetMargin) + ' kr/mån under din maxhyra. ' + (item.queueMargin >= 0 ? (item.queueMargin === 0 ? 'Din kötid motsvarar det historiska snittet.' : 'Din kötid är ' + item.queueMargin + ' år längre än det historiska snittet.') : 'Din kötid är ' + Math.abs(item.queueMargin) + ' år kortare än det historiska snittet.');
      }
      var delta = item.comparison;
      if (delta && Number.isFinite(delta.rentSaving) && Number.isFinite(delta.queueSaving)) {
        comparison.textContent += ' Jämfört med ' + delta.area + ' (' + delta.type + '): ' + (delta.rentSaving === 0 ? 'samma snitthyra' : money(Math.abs(delta.rentSaving)) + ' kr/mån ' + (delta.rentSaving > 0 ? 'lägre' : 'högre') + ' snitthyra') + ' och ' + (delta.queueSaving === 0 ? 'samma historiska kötid.' : Math.abs(delta.queueSaving) + ' år ' + (delta.queueSaving > 0 ? 'kortare' : 'längre') + ' historisk kötid.');
      }
      var note = document.createElement('p'); note.textContent = 'Underlag: ' + item.count + ' bostäder. ' + (item.count < 10 || item.rentCount < 10 ? 'Litet underlag. ' : '') + 'Historiska snitt för ettor och tvåor 2025, ingen garanti för bostad.';
      box.append(heading, text);
      if (comparison.textContent) box.append(comparison);
      box.append(note); (currentTurn || log).append(box);
    });
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
    currentTurn = document.createElement('div'); log.append(currentTurn); turns.push(currentTurn);
    if (turns.length > 3) turns.shift().remove();
    entry('Du', question);
    try {
      var response = await fetch(endpoint + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
      var result = await response.json();
      if (!response.ok) throw Error(result.error || 'AI-guiden kunde inte svara. Försök igen senare.');
      if (typeof result.answer !== 'string' || !Array.isArray(result.cards)) throw Error('Svaret kunde inte visas.');
      if (typeof result.summary === 'string') entry('Din sökning', result.summary);
      if (result.scopeNote) entry('Sökområde', result.scopeNote);
      entry('Portunus – AI-svar', result.answer);
      if (result.status) entry('Statistikens jämförelse', result.status);
      cards(result.cards);
      history.push({ role: 'user', content: question }, { role: 'assistant', content: ((result.search ? 'Bekräftade sökval: ' + JSON.stringify(result.search) + '\n' : '') + result.answer).slice(0, 1600) });
      history = history.slice(-4);
      document.getElementById('bot-question').value = '';
      currentTurn.scrollIntoView({ behavior: 'smooth', block: 'start' });
      status.textContent = 'Svaret är klart. AI-text kan innehålla fel; kortens siffror kommer från statistiken.';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'Svaret tog för lång tid. Inget nytt försök skickas automatiskt.' : error.message;
    } finally {
      loading = false; token = ''; send.disabled = true; reset.disabled = false; panel.setAttribute('aria-busy', 'false');
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });
})();
