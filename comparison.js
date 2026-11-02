/* Local comparison of the same housing type and the same one-/two-room dataset. */
var PortunusComparison = (function () {
  'use strict';
  var number = function (value) { return new Intl.NumberFormat('sv-SE').format(value); };
  function metrics(data, housing, queue) {
    var fresh = housing === 'new';
    var q = fresh ? data.ny : data.vanlig, rent = fresh ? data.hyraNy : data.hyra;
    var count = fresh ? data.antalNy : data.antal, rentCount = fresh ? data.antalHyraNy : data.antalHyra;
    var hasQueue = Number.isFinite(q) && q >= 0 && count > 0;
    var hasRent = Number.isFinite(rent) && rent > 0 && rentCount > 0;
    return { queue: hasQueue ? q : null, rent: hasRent ? rent : null,
      count: Number.isInteger(count) && count > 0 ? count : 0,
      rentCount: Number.isInteger(rentCount) && rentCount > 0 ? rentCount : 0,
      remaining: hasQueue ? Math.max(q - queue, 0) : null,
      small: (hasQueue && count < 10) || (hasRent && rentCount < 10) };
  }
  function describe(a, b, leftName, rightName) {
    if (leftName === rightName) return 'Du jämför samma område. Välj ett annat område för att se skillnaden.';
    var parts = [];
    if (a.queue !== null && b.queue !== null) {
      if (a.queue === b.queue) parts.push('Områdena har samma historiska kötid.');
      else parts.push((a.queue < b.queue ? leftName : rightName) + ' har ' + number(Math.abs(a.queue - b.queue)) + ' år kortare historisk kötid.');
    }
    if (a.rent !== null && b.rent !== null) {
      if (a.rent === b.rent) parts.push('Snitthyran är densamma.');
      else parts.push((a.rent < b.rent ? leftName : rightName) + ' har ' + number(Math.abs(a.rent - b.rent)) + ' kr lägre snitthyra per månad.');
    }
    if (a.queue === null || b.queue === null || a.rent === null || b.rent === null) parts.push('Saknat underlag gör att alla uppgifter inte kan jämföras.');
    return parts.join(' ');
  }
  function init() {
    if (typeof document === 'undefined') return;
    var panel = document.getElementById('comparison');
    if (!panel || typeof statistik2025 === 'undefined') return;
    var data = statistik2025.kommuner, form = document.getElementById('kotidsform');
    var town = document.getElementById('comparison-municipality');
    var area = document.getElementById('comparison-area');
    var housing = document.getElementById('comparison-housing');
    var toggle = document.getElementById('comparison-toggle');
    var personal = uppdateraValidering();
    var state = {municipality:form.kommun.value, area:form.omrade.value, queue:personal.kotid, budget:personal.budget};
    Object.keys(data).sort(function (a, b) { return a.localeCompare(b, 'sv'); }).forEach(function (name) { town.add(new Option(name, name)); });
    town.value = state.municipality;
    function populate() {
      area.replaceChildren(new Option('Välj ett område', ''));
      Object.keys(data[town.value]).sort(function (a, b) { return a.localeCompare(b, 'sv'); }).forEach(function (name) { area.add(new Option(name, name)); });
      area.value = '';
    }
    function writeCard(side, municipality, name, values) {
      document.getElementById('comparison-' + side + '-name').textContent = name;
      document.getElementById('comparison-' + side + '-town').textContent = municipality;
      document.getElementById('comparison-' + side + '-queue').textContent = values.queue === null ? 'Underlag saknas' : number(values.queue) + ' år';
      document.getElementById('comparison-' + side + '-rent').textContent = values.rent === null ? 'Underlag saknas' : number(values.rent) + ' kr/mån';
      document.getElementById('comparison-' + side + '-queue').classList.toggle('comparison-missing', values.queue === null);
      document.getElementById('comparison-' + side + '-rent').classList.toggle('comparison-missing', values.rent === null);
      var budget = document.getElementById('comparison-' + side + '-budget');
      budget.textContent = values.rent !== null && state.budget !== null
        ? (values.rent === state.budget ? 'Samma som din maxhyra' : number(Math.abs(values.rent - state.budget)) + ' kr ' + (values.rent < state.budget ? 'under' : 'över') + ' din maxhyra') : '';
      budget.hidden = !budget.textContent;
      document.getElementById('comparison-' + side + '-remaining').textContent = values.remaining === null ? 'Underlag saknas' : values.remaining === 0 ? 'Din kötid når snittet' : number(values.remaining) + ' år till snittet';
      document.getElementById('comparison-' + side + '-count').textContent = values.count === 0 && values.rentCount === 0 ? 'Underlag saknas' : values.count === values.rentCount ? number(values.count) + ' bostäder' : number(values.count) + ' för kötid · ' + number(values.rentCount) + ' för hyra';
      document.getElementById('comparison-' + side + '-warning').hidden = !values.small;
    }
    function render() {
      var left = metrics(data[state.municipality][state.area], housing.value, state.queue);
      writeCard('left', state.municipality, state.area, left);
      document.getElementById('comparison-context').textContent = 'Din kötid: ' + number(state.queue) + ' år' + (state.budget === null ? '' : ' · Maxhyra: ' + number(state.budget) + ' kr/mån') + '. Uppdateras när du gör en ny uträkning.';
      var selected = !!area.value;
      document.getElementById('comparison-right-values').hidden = !selected;
      document.getElementById('comparison-empty').hidden = selected;
      document.getElementById('comparison-right-warning').hidden = true;
      var summary = document.getElementById('comparison-summary');
      summary.hidden = !selected;
      if (!selected) {
        document.getElementById('comparison-right-name').textContent = 'Ditt andra område';
        document.getElementById('comparison-right-town').textContent = 'Välj kommun och område ovanför';
        summary.textContent = '';
        return;
      }
      var right = metrics(data[town.value][area.value], housing.value, state.queue);
      writeCard('right', town.value, area.value, right);
      var same = state.municipality === town.value && state.area === area.value;
      var leftName = state.area, rightName = area.value;
      if (!same && leftName === rightName) { leftName += ' (' + state.municipality + ')'; rightName += ' (' + town.value + ')'; }
      summary.textContent = describe(left, right, leftName, rightName);
    }
    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Stäng jämförelsen' : 'Jämför med ett annat område';
      if (open) {
        render();
        panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
        document.getElementById('comparison-heading').focus({preventScroll:true});
      } else toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(panel.hidden); });
    document.getElementById('comparison-close').addEventListener('click', function () { setOpen(false); });
    town.addEventListener('change', function () { populate(); render(); });
    area.addEventListener('change', render);
    housing.addEventListener('change', render);
    document.addEventListener('portunus:calculated', function (event) {
      state = event.detail;
      if (!area.value) { town.value = state.municipality; populate(); }
      render();
    });
    populate();
    document.getElementById('comparison-note').textContent = 'Samma bostadstyp i båda korten. Historiska snitt för ettor och tvåor ' + statistik2025.ar + ', ingen bostadsgaranti. Saknade uppgifter betyder inte att bostäder saknas.';
    render();
    toggle.hidden = false;
  }
  return { metrics:metrics, describe:describe, init:init };
}());
PortunusComparison.init();
