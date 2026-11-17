/* Citygame Map Experience v2
 * Reworks the destination panel into a searchable, filterable city directory.
 * Uses the existing authoritative world locations and GPS/travel handlers.
 */
(function () {
  'use strict';
  if (typeof placesList !== 'function' || typeof window.CG_POS !== 'function' || typeof mapside === 'undefined') {
    console.warn('Citygame Map Experience: base map is not ready');
    return;
  }

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const iconFor = p => p.icon || '📍';
  const labelFor = p => p.type || p.kind || 'destination';
  let query = '';
  let category = 'all';
  let previousRender = renderSide;

  const style = document.createElement('style');
  style.textContent = `
    #bigmap{background:#081321;color:#edf5ff}
    #bigmap canvas{background:#10243a;max-width:62vw;max-height:100dvh;object-fit:contain}
    #mapside{min-width:0;background:linear-gradient(180deg,#111d30,#091321);padding:clamp(9px,1.5vw,18px);color:#edf5ff}
    .cg-map-head{position:sticky;top:-8px;z-index:3;padding:8px 0 11px;background:#111d30}
    .cg-map-kicker{font-size:9px;letter-spacing:1.8px;color:#65d9ca;font-weight:900}
    .cg-map-title{font-size:20px;font-weight:900;margin:4px 0}
    .cg-map-sub{font-size:11px;color:#9eb1c8}
    .cg-map-search{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #35465e;border-radius:12px;background:#0a1422;color:#fff;text-align:left;font-size:13px;margin:10px 0}
    .cg-map-cats{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:thin}
    .cg-map-cats button{flex:0 0 auto;border:1px solid #35465e;border-radius:20px;padding:7px 10px;background:#18283c;color:#dce8f7;font-size:10px}
    .cg-map-cats button.active{background:#075985;border-color:#38bdf8;color:#fff}
    .cg-map-results{display:flex;justify-content:space-between;align-items:center;color:#8fa6bf;font-size:10px;padding:3px 2px 7px}
    .cg-map-list{display:grid;gap:5px}
    .cg-map-place{display:flex;align-items:center;gap:9px;width:100%;padding:9px;border:1px solid #263951;border-radius:11px;background:#142238;color:#edf5ff;text-align:left}
    .cg-map-place.selected{border-color:#facc55;background:#26334a}
    .cg-map-place .cg-map-icon{font-size:20px}
    .cg-map-place .cg-map-name{flex:1;min-width:0;font-size:11px;font-weight:800;overflow-wrap:anywhere}
    .cg-map-place small{display:block;color:#91a8c0;font-size:9px;font-weight:500;margin-top:2px}
    .cg-map-distance{font-size:10px;color:#b5c5d8;white-space:nowrap}
    .cg-map-detail{margin-top:10px;padding:12px;border:1px solid #3c506c;border-radius:14px;background:linear-gradient(145deg,#1b3048,#111c2d)}
    .cg-map-detail h3{font-size:15px;margin:4px 0}
    .cg-map-detail p{font-size:10px;color:#b1c2d5;margin:5px 0 10px}
    .cg-map-actions{display:flex;flex-wrap:wrap;gap:6px}
    .cg-map-actions button{flex:1 1 42%;padding:9px 8px;border:0;border-radius:9px;background:#facc55;color:#172033;font-weight:900;font-size:10px}
    .cg-map-actions button.secondary{background:#263d58;color:#e5f0ff;border:1px solid #4b6380}
    .cg-map-empty{padding:18px;text-align:center;color:#9eb1c8;font-size:11px}
    @media(max-width:650px){
      #bigmap{flex-direction:column}
      #bigmap canvas{max-width:100vw;max-height:44dvh;width:min(100vw,44dvh)!important;height:min(100vw,44dvh)!important;align-self:center}
      #mapside{flex:1;min-height:0;padding:8px 12px}
      .cg-map-head{top:-8px}
      .cg-map-list{grid-template-columns:repeat(2,minmax(0,1fr))}
      .cg-map-place{padding:7px;gap:6px}
      .cg-map-place .cg-map-name{font-size:10px}
      .cg-map-distance{font-size:9px}
    }
    @media(max-width:390px){.cg-map-list{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function allPlaces() {
    return placesList().map(p => {
      const distance = Math.round(Math.hypot(p.x - window.CG_POS().x, p.z - window.CG_POS().z));
      return Object.assign({}, p, { _distance: distance, _category: String(labelFor(p)).toLowerCase() });
    }).sort((a, b) => a._distance - b._distance);
  }

  function renderMapPanel() {
    const all = allPlaces();
    const cats = [...new Set(all.map(p => p._category))].sort();
    const term = query.trim().toLowerCase();
    const filtered = all.filter(p =>
      (category === 'all' || p._category === category) &&
      (!term || [p.name, p.area, p.owner, p._category].join(' ').toLowerCase().includes(term))
    );
    const selected = all.find(p => String(p.id) === String(selPlace));
    const count = all.length;
    const catButton = (key, title) =>
      '<button type="button" data-cg-cat="' + esc(key) + '" class="' + (category === key ? 'active' : '') + '">' + esc(title) + '</button>';

    let html = '<div class="cg-map-head">' +
      '<div class="cg-map-kicker">CITYGAME • LAGOS NAVIGATION</div>' +
      '<div class="cg-map-title">Explore Lagos</div>' +
      '<div class="cg-map-sub">' + count.toLocaleString() + ' destinations · ' +
      (gps ? 'GPS set: ' + esc(gps.name) : 'Choose a place to view details or set a route') + '</div>' +
      '<input class="cg-map-search" id="cgMapSearch" type="search" autocomplete="off" placeholder="Search a place, business or district…" value="' + esc(query) + '">' +
      '<div class="cg-map-cats">' + catButton('all', 'All places') +
      cats.map(c => catButton(c, c.replace(/\b\w/g, x => x.toUpperCase()))).join('') + '</div>' +
      '<div class="cg-map-results"><b>' + filtered.length + ' results</b><span>Nearest first</span></div></div>';

    html += '<div class="cg-map-list">' + filtered.slice(0, 180).map(p =>
      '<button type="button" class="cg-map-place ' + (String(selPlace) === String(p.id) ? 'selected' : '') + '" data-cg-place="' + esc(p.id) + '">' +
      '<span class="cg-map-icon">' + esc(iconFor(p)) + '</span><span class="cg-map-name">' + esc(p.name) +
      '<small>' + esc(p.area || 'Lagos') + ' · ' + esc(labelFor(p)) + '</small></span>' +
      '<span class="cg-map-distance">' + (p._distance >= 1000 ? (p._distance / 1000).toFixed(1) + ' km' : p._distance + ' m') + '</span></button>'
    ).join('') + '</div>';

    if (!filtered.length) html += '<div class="cg-map-empty">No matching destinations. Try another search.</div>';
    if (filtered.length > 180) html += '<div class="cg-map-empty">Showing the first 180 results. Narrow your search to find a specific place.</div>';

    if (selected) {
      html += '<section class="cg-map-detail"><div class="cg-map-kicker">SELECTED DESTINATION</div>' +
        '<h3>' + esc(iconFor(selected)) + ' ' + esc(selected.name) + '</h3>' +
        '<p>' + esc(selected.area || 'Lagos') + ' · ' + esc(labelFor(selected)) + ' · ' +
        (selected._distance >= 1000 ? (selected._distance / 1000).toFixed(1) + ' km away' : selected._distance + ' m away') + '</p>' +
        '<div class="cg-map-actions"><button type="button" data-cg-action="gps">Set GPS route</button>' +
        '<button type="button" class="secondary" data-cg-action="close">Return to city</button>';
      if (world && world.rides) {
        Object.keys(world.rides).forEach(k => {
          const ride = world.rides[k];
          html += '<button type="button" class="secondary" data-cg-ride="' + esc(k) + '">' +
            (k === 'keke' ? '🛺 ' : k === 'danfo' ? '🚌 ' : k === 'jet' ? '✈️ ' : '🏍️ ') +
            esc(ride.name) + ' · ₦' + Number(fareOf(ride, selected._distance) || 0).toLocaleString('en-NG') + '</button>';
        });
      }
      html += '</div></section>';
    } else {
      html += '<div class="cg-map-detail"><b>📍 Your location</b><p>Select any marker on the map or a destination in this list. GPS guides you through the existing city navigation system.</p>' +
        (gps ? '<div class="cg-map-actions"><button type="button" class="secondary" data-cg-action="clear">Clear current route</button></div>' : '') +
        '</div>';
    }
    mapside.innerHTML = html;

    const input = mapside.querySelector('#cgMapSearch');
    if (input) input.addEventListener('input', () => {
      query = input.value;
      const caret = input.selectionStart;
      renderMapPanel();
      const next = mapside.querySelector('#cgMapSearch');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    });
  }

  renderSide = renderMapPanel;
  mapside.addEventListener('click', event => {
    const cat = event.target.closest('[data-cg-cat]');
    if (cat) { category = cat.dataset.cgCat; renderMapPanel(); return; }
    const place = event.target.closest('[data-cg-place]');
    if (place) { selPlace = place.dataset.cgPlace; renderMapPanel(); drawBigMap(); return; }
    const action = event.target.closest('[data-cg-action]');
    if (action) {
      const op = action.dataset.cgAction;
      if (op === 'gps') setGps(selPlace);
      else if (op === 'clear') { gps = null; renderMapPanel(); drawBigMap(); }
      else if (op === 'close') closeMap();
      return;
    }
    const ride = event.target.closest('[data-cg-ride]');
    if (ride) {
      if (myCol >= 0) { toast('Exit your vehicle before taking public transport.'); return; }
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'travel', place: selPlace, ride: ride.dataset.cgRide }));
      else toast('Multiplayer connection is not ready. Try again shortly.');
      closeMap();
    }
  });

  const originalOpenMap = openMap;
  openMap = function () {
    originalOpenMap();
    if (bigmap.style.display !== 'none') renderMapPanel();
  };
  window.addEventListener('resize', () => {
    if (bigmap.style.display !== 'none') {
      sizeMap();
      renderMapPanel();
      drawBigMap();
    }
  });
  console.info('Citygame Map Experience v2 ready');
})();