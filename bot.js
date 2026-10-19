(function () {
  'use strict';
  var toggle = document.getElementById('bot-toggle');
  var panel = document.getElementById('bot-panel');
  var status = document.getElementById('bot-status');
  var botForm = document.getElementById('bot-form');
  var log = document.getElementById('bot-log');
  var send = document.getElementById('bot-send');
  var token = '', widget = null, endpoint = '', loading = false, initPromise = null;
  var session = crypto.randomUUID();
  try { session = sessionStorage.getItem('portunus-bot-session') || session; sessionStorage.setItem('portunus-bot-session', session); } catch (_) {}
  function entry(role, value) {
    var box = document.createElement('div'); box.className = 'bot-message';
    var title = document.createElement('strong'); title.textContent = role;
    var text = document.createElement('p'); text.textContent = value;
    box.append(title, text); log.append(box);
    while (log.children.length > 8) log.firstElementChild.remove();
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
      var button = document.createElement('button'); button.type = 'button'; button.textContent = 'Visa i uträknaren';
      button.addEventListener('click', function () {
        var form = document.getElementById('kotidsform');
        if (!Object.hasOwn(kotider, item.municipality) || !Object.hasOwn(kotider[item.municipality], item.area)) return;
        form.kommun.value = item.municipality; uppdateraOmraden(); form.omrade.value = item.area;
        if (raknaUtAlder() === false) return;
        document.getElementById('rakning').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      box.append(heading, text);
      if (comparison.textContent) box.append(comparison);
      box.append(note, button); log.append(box);
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
  botForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (loading || !endpoint || !token || !botForm.reportValidity()) return;
    var form = document.getElementById('kotidsform');
    var values = uppdateraValidering();
    if (!form.reportValidity()) { status.textContent = 'Kontrollera ålder, kötid och maxhyra i uträknaren.'; return; }
    var question = document.getElementById('bot-question').value.trim();
    if (!question) return;
    if (values.budget !== null && values.budget > 1000000) { status.textContent = 'Ange en lägre maxhyra i uträknaren.'; return; }
    var body = { question: question, session: session, token: token, consent: document.getElementById('bot-consent').checked,
      age: values.alder, queue: values.kotid, budget: values.budget, municipality: form.kommun.value, area: form.omrade.value, scope: form.forslagScope.value };
    loading = true; send.disabled = true; panel.setAttribute('aria-busy', 'true'); status.textContent = 'Portunus arbetar med ditt svar…';
    log.replaceChildren(); entry('Du', question);
    try {
      var response = await fetch(endpoint + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
      var result = await response.json();
      if (!response.ok) throw Error(result.error || 'AI-guiden kunde inte svara. Försök igen senare.');
      if (typeof result.answer !== 'string' || !Array.isArray(result.cards)) throw Error('Svaret kunde inte visas.');
      entry('Portunus – AI-svar', result.answer); cards(result.cards);
      panel.scrollTop = 0;
      status.textContent = 'Svaret är klart. AI-text kan innehålla fel; kortens siffror kommer från statistiken.';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'Svaret tog för lång tid. Inget nytt försök skickas automatiskt.' : error.message;
    } finally {
      loading = false; token = ''; send.disabled = true; panel.setAttribute('aria-busy', 'false');
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });
})();
