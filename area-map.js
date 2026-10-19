(function () {
  'use strict';
  var section = document.getElementById('omradeskarta');
  if (!section) return;
  var form = document.getElementById('kotidsform');
  var municipality = document.getElementById('map-municipality');
  var housing = document.getElementById('map-housing');
  var onlyMatches = document.getElementById('map-only-matches');
  var status = document.getElementById('map-status');
  var loadButton = document.getElementById('map-load');
  var fitButton = document.getElementById('map-fit');
  var map, group, pending = false, selected = '', markerIndex = {}, lastMunicipality = form.kommun.value;
  var locations = window.PORTUNUS_MAP_LOCATIONS || {};
  var all = [];
  Object.keys(kotider).forEach(function (m) {
    Object.keys(kotider[m]).forEach(function (a) {
      var position = locations[m] && locations[m][a];
      if (position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) all.push({ municipality: m, area: a, position: position });
    });
  });
  Object.keys(kotider).sort(function (a, b) { return a.localeCompare(b, 'sv'); }).forEach(function (m) { municipality.add(new Option(m, m)); });
  municipality.value = form.kommun.value;
  function ownValues() {
    var age = form.alder.value === '' ? 22 : Number(form.alder.value);
    var queue = form.kotid.value === '' ? Math.min(2, Math.max(age - 18, 0)) : Number(form.kotid.value);
    var budget = form.maxhyra.value === '' ? null : Number(form.maxhyra.value);
    return { valid: Number.isInteger(age) && age >= 18 && age <= 99 && Number.isInteger(queue) && queue >= 0 && queue <= age - 18 && (budget === null || (Number.isSafeInteger(budget) && budget > 0)),
      queue: Number.isInteger(age) && age >= 18 && age <= 99 && Number.isInteger(queue) && queue >= 0 && queue <= age - 18 ? queue : null,
      budget: budget === null || (Number.isSafeInteger(budget) && budget > 0) ? budget : null };
  }
  function facts(row) {
    var d = kotider[row.municipality][row.area], isNew = housing.value === 'new';
    var queue = isNew ? d.ny : d.vanlig, rent = isNew ? d.hyraNy : d.hyra;
    var count = isNew ? d.antalNy : d.antal, rentCount = isNew ? d.antalHyraNy : d.antalHyra;
    var own = ownValues();
    var known = Number.isFinite(queue) && count > 0 && Number.isFinite(rent) && rent > 0 && rentCount > 0;
    return { queue: queue, rent: rent, count: count, rentCount: rentCount, known: known,
      match: known && own.valid && own.queue >= queue && (own.budget === null || rent <= own.budget) };
  }
  function popup(row, data) {
    var box = document.createElement('div'); box.className = 'area-popup';
    var heading = document.createElement('strong'); heading.textContent = row.area;
    var location = document.createElement('p'); location.textContent = row.municipality + ' · ' + (housing.value === 'new' ? 'Nyproduktion' : 'Befintliga bostäder');
    var values = document.createElement('p'); values.className = 'area-popup-values';
    values.textContent = (Number.isFinite(data.rent) && data.rent > 0 && data.rentCount > 0 ? new Intl.NumberFormat('sv-SE').format(data.rent) + ' kr/mån' : 'Hyresunderlag saknas') + ' · ' + (Number.isFinite(data.queue) && data.count > 0 ? data.queue + ' års kötid' : 'Köunderlag saknas');
    var note = document.createElement('p'); note.textContent = 'Underlag: ' + data.count + ' bostäder' + (data.rentCount !== data.count ? ', varav ' + data.rentCount + ' med hyresuppgift' : '') + '.' + (data.count > 0 && (data.count < 10 || data.rentCount < 10) ? ' Litet underlag.' : '');
    var button = document.createElement('button'); button.type = 'button'; button.textContent = 'Välj i uträknaren';
    button.addEventListener('click', function () {
      form.kommun.value = row.municipality; uppdateraOmraden(); form.omrade.value = row.area;
      lastMunicipality = row.municipality; selected = row.municipality + '|' + row.area;
      if (raknaUtAlder() === false) { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      document.getElementById('rakning').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    box.append(heading, location, values, note, button);
    return box;
  }
  function visibleRows() {
    return all.filter(function (row) { return (!municipality.value || row.municipality === municipality.value) && (!onlyMatches.checked || facts(row).match); });
  }
  function fit() {
    if (!map) return;
    var rows = visibleRows();
    if (!rows.length) return;
    map.fitBounds(rows.map(function (row) { return [row.position.lat, row.position.lng]; }), { padding: [30, 30], maxZoom: 13 });
  }
  function render(zoom) {
    if (!map) return;
    group.clearLayers(); markerIndex = {};
    var rows = visibleRows();
    rows.forEach(function (row) {
      var data = facts(row), key = row.municipality + '|' + row.area;
      var colour = !data.known ? 'missing' : data.match ? 'match' : 'other';
      var marker = L.marker([row.position.lat, row.position.lng], {
        icon: L.divIcon({ className: 'area-pin area-pin--' + colour + (key === selected ? ' area-pin--selected' : ''), html: '<span aria-hidden="true"></span>', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -13] }),
        title: row.area + ' – ' + row.municipality, alt: row.area + ' – ' + row.municipality, keyboard: true
      });
      marker.bindPopup(popup(row, data), { maxWidth: Math.max(160, Math.min(280, (document.getElementById('area-map').clientWidth || 320) - 60)) });
      marker.on('click', function () {
        selected = key;
        Object.keys(markerIndex).forEach(function (id) { var element = markerIndex[id].getElement(); if (element) element.classList.toggle('area-pin--selected', id === selected); });
      });
      markerIndex[key] = marker; group.addLayer(marker);
    });
    var total = Object.keys(kotider).reduce(function (sum, m) { return sum + Object.keys(kotider[m]).length; }, 0);
    status.textContent = rows.length ? rows.length + ' områden på kartan' + (municipality.value ? ' i ' + municipality.value : ' i alla kommuner') + '.' : 'Inga områden matchar kartans filter. Prova att visa alla områden.';
    if (!ownValues().valid) status.textContent += ' Kontrollera ålder, kötid och maxhyra i uträknaren.';
    var inScope = municipality.value ? all.filter(function (row) { return row.municipality === municipality.value; }).length : all.length;
    var scopeTotal = municipality.value ? Object.keys(kotider[municipality.value]).length : total;
    if (inScope < scopeTotal) status.textContent += ' Kartläge saknas för ' + (scopeTotal - inScope) + ' områden i detta urval; de finns i uträknaren.';
    document.getElementById('map-match-label').textContent = ownValues().budget === null ? 'Din kötid når snittet' : 'Kötid och snitthyra inom dina val';
    if (zoom) fit();
  }
  function asset(url, type, integrity) {
    return new Promise(function (resolve, reject) {
      var element = document.createElement(type === 'css' ? 'link' : 'script');
      if (type === 'css') { element.rel = 'stylesheet'; element.href = url; } else { element.src = url; element.async = true; }
      if (integrity) { element.integrity = integrity; element.crossOrigin = 'anonymous'; }
      var timer = setTimeout(function () { element.remove(); reject(Error('timeout')); }, 15000);
      element.onload = function () { clearTimeout(timer); resolve(); };
      element.onerror = function () { clearTimeout(timer); element.remove(); reject(Error('network')); };
      document.head.append(element);
    });
  }
  async function load() {
    if (map || pending) return;
    pending = true; loadButton.disabled = true; status.textContent = 'Laddar kartan…';
    try {
      await Promise.all([
        asset('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'css', 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='),
        asset('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', 'css', 'sha256-YU3qCpj/P06tdPBJGPax0bm6Q1wltfwjsho5TR4+TYc='),
        window.L ? Promise.resolve() : asset('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'js', 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=')
      ]);
      if (!L.markerClusterGroup) await asset('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', 'js', 'sha256-Hk4dIpcqOSb0hZjgyvFOP+cEmDXUKKNE/tT542ZbNQg=');
      map = L.map('area-map', { scrollWheelZoom: false, maxZoom: 18 }).setView([59.33, 18.06], 10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, updateWhenIdle: true, keepBuffer: 1,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map).on('tileerror', function () { status.textContent = 'Bakgrundskartan kunde inte laddas. Områdesmarkörerna kan fortfarande användas.'; });
      group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 38, iconCreateFunction: function (cluster) {
        return L.divIcon({ className: 'area-cluster', html: '<span>' + cluster.getChildCount() + '</span>', iconSize: [44, 44] });
      } });
      map.addLayer(group); loadButton.hidden = true; fitButton.disabled = false;
      selected = form.kommun.value + '|' + form.omrade.value;
      render(true);
    } catch (_) {
      if (map) { map.remove(); map = null; }
      loadButton.hidden = false; fitButton.disabled = true;
      status.textContent = 'Kartan kunde inte laddas. Du kan fortfarande välja alla områden i uträknaren.';
      loadButton.textContent = 'Försök igen';
    } finally { pending = false; loadButton.disabled = false; }
  }
  loadButton.addEventListener('click', load);
  fitButton.addEventListener('click', fit);
  municipality.addEventListener('change', function () { render(true); });
  housing.addEventListener('change', function () { render(false); });
  onlyMatches.addEventListener('change', function () { render(true); });
  form.addEventListener('input', function () { render(false); });
  form.addEventListener('change', function () {
    var changedMunicipality = form.kommun.value !== lastMunicipality;
    if (changedMunicipality) { municipality.value = form.kommun.value; lastMunicipality = form.kommun.value; }
    selected = form.kommun.value + '|' + form.omrade.value;
    render(changedMunicipality);
  });
  form.addEventListener('submit', function () {
    selected = form.kommun.value + '|' + form.omrade.value;
    if (municipality.value && municipality.value !== form.kommun.value) municipality.value = form.kommun.value;
    render(false);
    var marker = markerIndex[selected];
    if (marker) group.zoomToShowLayer(marker, function () { marker.openPopup(); });
  });
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) { if (entries.some(function (entry) { return entry.isIntersecting; })) { observer.disconnect(); load(); } }, { rootMargin: '150px' });
    observer.observe(section);
  }
})();
