/* The whole page: the four-day strip, the map, the dots and the information
   pane. The pane always opens in the same place -- the far right of the map --
   so pointing at a dot never covers the dots around it. On a phone it is a
   sheet rising from the bottom instead (CSS does that). */
(function(){
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOUCH = window.matchMedia && matchMedia('(hover: none)').matches;
const narrow = () => window.innerWidth <= 760;
const ITEMS = [...PLACES, ...EATS];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
const ALL = [HOTEL, SHOW, ...ITEMS];
const byId = id => ALL.find(i => i.id === id);

/* ================= THE FOUR DAYS + WEATHER ================= */
const WX = {
  0:['Clear','sun'],1:['Mostly clear','sun'],2:['Partly cloudy','cloudsun'],3:['Overcast','cloud'],
  45:['Fog','fog'],48:['Fog','fog'],51:['Light drizzle','rain'],53:['Drizzle','rain'],55:['Drizzle','rain'],
  56:['Freezing drizzle','sleet'],57:['Freezing drizzle','sleet'],61:['Light rain','rain'],63:['Rain','rain'],65:['Heavy rain','rain'],
  66:['Freezing rain','sleet'],67:['Freezing rain','sleet'],71:['Light snow','snow'],73:['Snow','snow'],75:['Heavy snow','snow'],77:['Snow','snow'],
  80:['Showers','rain'],81:['Showers','rain'],82:['Heavy showers','rain'],85:['Snow showers','snow'],86:['Snow showers','snow'],95:['Thunderstorm','storm'],96:['Thunderstorm','storm'],99:['Thunderstorm','storm']
};
const GLYPH = {
  sun:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  cloudsun:'<path d="M7 17.5h9.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 7.5 11a3.25 3.25 0 0 0-.5 6.5z"/><path d="M15 6a3 3 0 1 1 3.9 3.5"/><path d="M15 2.5V4M20.5 4.5l-1 1M22 9.5h-1.5"/>',
  cloud:'<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 11a3.75 3.75 0 0 0 1 7.5z"/>',
  fog:'<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 7a3.75 3.75 0 0 0 1 7.5z"/><path d="M5 18h14M7 21h10"/>',
  rain:'<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 8a3.75 3.75 0 0 0 1 7.5z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  sleet:'<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 8a3.75 3.75 0 0 0 1 7.5z"/><path d="M9 18l-1 3M16 18l-1 3"/><circle cx="12.5" cy="19.5" r="1"/>',
  snow:'<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 8a3.75 3.75 0 0 0 1 7.5z"/><circle cx="9" cy="19" r="1"/><circle cx="13" cy="21" r="1"/><circle cx="16" cy="18.5" r="1"/>',
  storm:'<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 8a3.75 3.75 0 0 0 1 7.5z"/><path d="M13 15l-2.5 4h3L11 23"/>'
};
const glyph = g => `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[g]}</svg>`;
const NORMALS = [{h:46,l:36},{h:46,l:36},{h:45,l:35},{h:45,l:35}];   // December normals, Central Park

function renderDays(daily, mode){   // mode: 'live' | 'lastyear' | null
  const el = $('#days'); if (!el) return;
  el.innerHTML = TRIP.map((day, i) => {
    const key = mode === 'lastyear' ? day.d.replace('2026', '2025') : day.d;
    const j = daily && daily.time ? daily.time.indexOf(key) : -1;
    const have = j >= 0 && daily.weather_code[j] != null;
    const [desc, g] = have ? (WX[daily.weather_code[j]] || ['Cloudy','cloud']) : ['Cold','cloudsun'];
    const hi = have ? Math.round(daily.temperature_2m_max[j]) : NORMALS[i].h;
    const lo = have ? Math.round(daily.temperature_2m_min[j]) : NORMALS[i].l;
    // Say plainly where the numbers come from: a forecast, last year's actual
    // weather on the same date, or just what December is usually like.
    const src = mode === 'live' ? desc : mode === 'lastyear' && have ? `${desc} last year` : 'Typical for December';
    return `<li class="day">
      <div class="dhead"><span class="dn">${day.name}</span><span class="dd">${day.date}</span></div>
      <div class="wx" title="${esc(src)}">${glyph(g)}<span class="t"><b>${hi}°</b> ${lo}°</span><span class="src">${esc(src)}</span></div>
      <p>${day.lines.map(esc).join('<br>')}</p>
    </li>`;
  }).join('');
  const note = $('#wxnote');
  if (note) note.textContent = mode === 'live' ? 'Weather: the current forecast'
    : mode === 'lastyear' ? 'Weather: what these dates were like last year' : 'Weather: typical for early December';
}
renderDays(null, null);
(async function(){
  const base = 'latitude=40.7484&longitude=-73.9857&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FNew_York';
  try{   // the real forecast, once the trip is inside the 16-day window
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${base}&start_date=${TRIP[0].d}&end_date=${TRIP[3].d}`);
    const j = await r.json();
    if (j && j.daily && j.daily.weather_code && j.daily.weather_code.some(x => x != null)){ renderDays(j.daily, 'live'); return; }
  }catch(e){}
  try{   // until then: what it actually did on these dates last year
    const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${base}&start_date=2025-12-04&end_date=2025-12-07`);
    const j = await r.json();
    if (j && j.daily && j.daily.weather_code) renderDays(j.daily, 'lastyear');
  }catch(e){}
})();

/* ================= INVOICES ================= */
(function(){
  const el = $('#bills'); if (!el || typeof CREW === 'undefined') return;
  el.innerHTML = CREW.map(c => `<button type="button" class="${c.paid ? 'paid' : ''}" data-who="${esc(c.name)}" title="Open ${esc(c.name)}’s ${c.paid ? 'receipt — paid in full' : 'invoice'}">${esc(c.name)}</button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('button[data-who]'); if (b) invoice(b.dataset.who); });
})();

/* ================= WALKING ================= */
// FOSSGIS runs real foot-profile routers; PACE/DETOUR are the offline fallback,
// tuned to agree with them.
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/';
const PACE = 65, DETOUR = 1.15;
function haversine(a, b){ const R = 6371000, r = x => x*Math.PI/180; const dLat = r(b.lat-a.lat), dLon = r(b.lon-a.lon); const s = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(s)); }
// Every place starts with an estimate so nothing ever reads blank; one request
// to the router then replaces all of them with real street-walking figures.
const WALK = {};
for (const it of [SHOW, ...ITEMS]){
  const m = haversine(HOTEL, it);
  WALK[it.id] = {min:Math.max(2, Math.round(m/PACE)), mi:m*DETOUR/1609.34, real:false};
}
async function timed(url, ms){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try{ const r = await fetch(url, {signal:ac.signal}); return await r.json(); }
  catch(e){ return null; }
  finally{ clearTimeout(t); }
}
(async function(){
  const dest = [SHOW, ...ITEMS];
  const j = await timed(`${ROUTER}table/v1/foot/${[HOTEL, ...dest].map(i => `${i.lon},${i.lat}`).join(';')}?sources=0&annotations=duration,distance`, 9000);
  if (!j || j.code !== 'Ok' || !j.durations) return;
  dest.forEach((it, n) => {
    const s = j.durations[0][n+1], m = j.distances && j.distances[0][n+1];
    if (s != null) WALK[it.id] = {min:Math.max(1, Math.round(s/60)), mi:(m != null ? m : haversine(HOTEL, it)*DETOUR)/1609.34, real:true};
  });
  renderList();
  if (cur) fillCard(cur);
})();
function walkText(it){
  const w = WALK[it.id]; if (!w) return '';
  const mi = w.mi < 0.15 ? 'just around the corner' : `${w.mi.toFixed(1)} mile${w.mi.toFixed(1) === '1.0' ? '' : 's'}`;
  const far = w.min > 40 ? '<span class="far">A long walk — the subway or a taxi is easier.</span>' : '';
  return `<b>${w.real ? '' : 'About '}${w.min} minute walk</b> from our hotel · ${mi}${far}`;
}
const GEOM = {};
async function routeTo(it){
  if (GEOM[it.id] !== undefined) return GEOM[it.id];
  const j = await timed(`${ROUTER}route/v1/foot/${HOTEL.lon},${HOTEL.lat};${it.lon},${it.lat}?overview=full&geometries=geojson`, 6000);
  const g = j && j.routes && j.routes[0] ? j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) : null;
  if (g) GEOM[it.id] = g;     // a failure isn't cached, so the next look retries
  return g;
}

/* ================= THE INFORMATION PANE ================= */
const card = $('#card');
const KIND = {see:'Place to see', eat:'Restaurant', hotel:'Where we’re staying', show:'Booked · Saturday night'};
const WALKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.2-6.2L8.8 12l1-5 3.2 1 2.2 3.2 3 1"/><path d="M13.2 14.8L15 21"/><path d="M9.8 7.2L7 9v3"/></svg>';
let cur = null, pinned = false, intentT = null, routeTok = 0;

function fillCard(it){
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${HOTEL.lat},${HOTEL.lon}&destination=${it.lat},${it.lon}&travelmode=walking`;
  card.innerHTML =
    `<button class="x" type="button" aria-label="Close">×</button>`
    + (it.img ? `<img src="${esc(it.img)}" alt="" onerror="this.remove()">` : '')
    + `<div class="cbody">
        <p class="kind k-${it.kind}">${KIND[it.kind]}</p>
        <h2>${esc(it.name)}</h2>
        <p class="sub">${esc(it.sub || '')}</p>
        ${it.best ? `<p class="best">${STAR}<span><b>50 Best Restaurants 2026</b>${esc(it.best)}</span></p>` : ''}
        <p class="about">${esc(it.about || '')}</p>
        ${it.kind === 'hotel' ? '' : `<p class="walk">${WALKER}<span>${walkText(it)}</span></p>`}
        <div class="acts">
          ${it.kind === 'hotel' ? '' : `<a class="btn go" href="${dir}" target="_blank" rel="noopener">Walking directions</a>`}
          ${it.url ? `<a class="btn" href="${esc(it.url)}" target="_blank" rel="noopener">Website</a>` : ''}
        </div>
      </div>`;
}
function openCard(it, pin){
  clearTimeout(intentT);
  if (pin) pinned = true;
  else if (cur !== it) pinned = false;
  if (cur === it){ return; }
  setOn(cur, false);
  cur = it; setOn(it, true);
  fillCard(it);
  card.hidden = false; card.scrollTop = 0;
  document.body.classList.add('has-card');
  reveal(it);
  drawRoute(it);
}
function closeCard(){
  if (!cur) return;
  setOn(cur, false); cur = null; pinned = false;
  card.hidden = true;
  document.body.classList.remove('has-card');
  drawRoute(null);
}
// The pane never goes away on its own -- it is a long way from the dot, and
// there has to be time to travel over and read it. Leaving a dot only cancels
// a hover that hadn't counted yet.
function leave(){ clearTimeout(intentT); }
// A short pause before a hover counts, so sweeping the pointer across the map
// doesn't flick through every dot it crosses. The pause is longer once a pane
// is open, and longer still for one that was clicked: the pointer has to cross
// other dots to reach the pane, and what's being read shouldn't change under it.
function intent(it){
  clearTimeout(intentT);
  if (cur === it) return;
  intentT = setTimeout(() => openCard(it, false), pinned ? 450 : cur ? 220 : 70);
}
card.addEventListener('click', e => { if (e.target.closest('.x')) closeCard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

function setOn(it, on){
  if (!it) return;
  if (it.marker){
    const el = it.marker.getElement(); if (el) el.classList.toggle('on', on);
    it.marker.setZIndexOffset(on ? 2000 : (it.kind === 'hotel' || it.kind === 'show') ? 1000 : 0);
  }
  const row = document.querySelector(`.row[data-id="${it.id}"]`); if (row) row.classList.toggle('on', on);
}

/* ================= THE LIST (what the page falls back to with no map) ================= */
function renderList(){
  const el = $('#list'); if (!el) return;
  const rows = (items) => items.slice().sort((a, b) => WALK[a.id].min - WALK[b.id].min).map(it =>
    `<button type="button" class="row ${cur === it ? 'on' : ''}" data-id="${it.id}">
       <span class="rdot ${it.kind}${it.best ? ' best' : ''}">${it.best ? STAR : ''}</span>
       <span class="rn"><b>${esc(it.name)}</b><i>${esc(it.sub || '')}</i></span>
       <span class="rw">${WALK[it.id].min}<small>min walk</small></span>
     </button>`).join('');
  el.innerHTML = `<h3>Places to see <small>nearest our hotel first</small></h3>${rows(PLACES)}
                  <h3>Places to eat <small>nearest our hotel first</small></h3>${rows(EATS)}`;
}
(function(){
  const el = $('#list'); if (!el) return;
  renderList();
  el.addEventListener('click', e => { const r = e.target.closest('.row'); if (r) openCard(byId(r.dataset.id), true); });
  el.addEventListener('mouseover', e => { const r = e.target.closest('.row'); pulse(r ? byId(r.dataset.id) : null); });
  el.addEventListener('mouseleave', () => pulse(null));
})();
let pulsed = null;
function pulse(it){
  if (pulsed === it) return;
  const set = (x, on) => { const el = x && x.marker && x.marker.getElement(); if (el) el.classList.toggle('pulse', on); };
  set(pulsed, false); pulsed = it; set(it, true);
}

/* ================= THE MAP ================= */
// Leaflet comes from a CDN. If it didn't load, the places are still worth
// having: show them as a plain list that opens the same information pane.
const HAS_MAP = typeof L !== 'undefined';
let map = null, routeLayer = null;
function reveal(){}
function drawRoute(){}

if (!HAS_MAP){
  document.body.classList.add('no-map');
  const m = $('#map');
  m.innerHTML = '<p class="map-down">The map didn’t load, so here is everything as a list.</p>' + ($('#list') ? '' : '<div id="list"></div>');
  renderList();
  $('#list').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) openCard(byId(r.dataset.id), true); });
  const lg = $('.legend'); if (lg) lg.hidden = true;
  return;
}

map = L.map('map', {zoomControl:false, zoomSnap:0.1, zoomDelta:0.5, wheelPxPerZoomLevel:90, minZoom:11, maxZoom:18,
                    maxBounds:[[40.60, -74.16], [40.90, -73.78]], maxBoundsViscosity:0.8});
L.control.zoom({position:'topleft', zoomInTitle:'Zoom in', zoomOutTitle:'Zoom out'}).addTo(map);
// Plain OSM tiles, muted to gray in CSS so the orange dots are the only colour.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
map.attributionControl.setPrefix(false).addAttribution('Walking routes: FOSSGIS · Weather: Open-Meteo');

// The whole-map view keeps every dot clear of where the pane opens, so on a
// normal screen the map never has to move when a dot is chosen.
const PANE = 380 + 16;     // the pane's width and its margin, as in nyc.css
const padRight = () => narrow() ? 40 : Math.min(PANE + 30, map.getSize().x * .45);
function showAll(){
  map.fitBounds(L.latLngBounds(ALL.map(i => [i.lat, i.lon])), {paddingTopLeft:[40, 34], paddingBottomRight:[padRight(), narrow() ? 40 : 30]});
}
showAll();
if (typeof SUBWAY_DATA !== 'undefined'){
  try{
    const pane = map.createPane('subway'); pane.style.zIndex = 350; pane.style.pointerEvents = 'none';
    for (const line of SUBWAY_DATA.lines)
      L.polyline(line.map(c => [c[1], c[0]]), {pane:'subway', color:'#0039a6', weight:1.2, opacity:.38, interactive:false}).addTo(map);
  }catch(e){}
}
const routePane = map.createPane('route'); routePane.style.zIndex = 450; routePane.style.pointerEvents = 'none';
routeLayer = L.layerGroup().addTo(map);

/* ---- markers ---- */
const TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/></svg>';
function addMarker(it){
  const fixed = it.kind === 'hotel' || it.kind === 'show';
  const icon = fixed
    ? L.divIcon({className:`fixedpin ${it.kind}`, html:`<span class="fp">${it.kind === 'hotel' ? STAR : TICKET}</span><span class="fl">${esc(it.label)}</span>`, iconSize:[36, 36], iconAnchor:[18, 18]})
    : L.divIcon({className:`dotwrap ${it.kind}${it.best ? ' best' : ''}`, html:it.best ? `<span class="star">${STAR}</span>` : '<span class="dot"></span>', iconSize:[40, 40], iconAnchor:[20, 20]});
  it.marker = L.marker([it.lat, it.lon], {icon, keyboard:true, zIndexOffset:fixed ? 1000 : 0, riseOnHover:true}).addTo(map);
  it.marker.on('mouseover', () => { if (!TOUCH) intent(it); });
  it.marker.on('mouseout', leave);
  it.marker.on('click', () => openCard(it, true));
  const el = it.marker.getElement();
  if (el){
    el.setAttribute('aria-label', `${it.name} — ${KIND[it.kind]}${it.best ? ', on the 50 Best list' : ''}`);
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) openCard(it, true); });
  }
}
ALL.forEach(addMarker);
map.on('click', closeCard);

// Several places share a block (Per Se and Masa share a floor), and at the
// whole-island zoom their dots would sit on top of each other, leaving one
// unreachable. Nudge them apart on screen until every dot is clear of the
// rest; zoom in and they settle back onto their real spots.
function spread(){
  const z = map.getZoom(), GAP = 23, GAP_FIXED = 30;
  const pts = ALL.map(it => { const p = map.project([it.lat, it.lon], z); return {it, x:p.x, y:p.y, fixed:it.kind === 'hotel' || it.kind === 'show'}; });
  // the hotel's and the show's name labels sit to the left of their pins, and
  // a dot under a label can't be seen: stand a row of obstacles along each
  for (const f of pts.filter(p => p.fixed)){
    const el = f.it.marker.getElement(), fl = el && el.querySelector('.fl');
    const w = fl ? fl.offsetWidth : 0;
    for (let x = 36; x < w + 30; x += 22) pts.push({x:f.x - x, y:f.y, fixed:true});
  }
  for (let pass = 0; pass < 60; pass++){
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i+1; j < pts.length; j++){
      const a = pts[i], b = pts[j]; if (a.fixed && b.fixed) continue;
      const need = a.fixed || b.fixed ? GAP_FIXED : GAP;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= need) continue;
      if (d < 0.5){ const ang = (i*7 + j*13) % 6; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
      const push = (need - d) / d, wa = a.fixed ? 0 : b.fixed ? 1 : .5, wb = 1 - wa;
      a.x -= dx*push*wa; a.y -= dy*push*wa; b.x += dx*push*wb; b.y += dy*push*wb; moved = true;
    }
    if (!moved) break;
  }
  for (const p of pts) if (!p.fixed) p.it.marker.setLatLng(map.unproject([p.x, p.y], z));
}
spread();
map.on('zoomend', () => { spread(); if (cur) redrawRouteEnds(); });

/* ---- keeping the chosen dot in view ---- */
// After zooming or dragging, a dot can end up underneath the pane (or under the
// sheet on a phone). Slide the map just far enough that the dot and the pane
// can be seen together. Does nothing when the dot is already clear.
reveal = function(it){
  const m = map.getContainer().getBoundingClientRect(), c = card.getBoundingClientRect();
  const pad = narrow()
    ? [44, Math.min(Math.max(0, m.bottom - c.top), m.height - 130) + 34]
    : [Math.min(Math.max(0, m.right - c.left), m.width - 160) + 34, 44];
  map.panInside(it.marker.getLatLng(), {paddingTopLeft:[44, 44], paddingBottomRight:pad});
};
window.addEventListener('resize', () => map.invalidateSize());

/* ---- the walk from the hotel ---- */
let lastGeom = null;
function paint(latlngs, solid){
  routeLayer.clearLayers();
  if (!latlngs) return;
  L.polyline(latlngs, {pane:'route', color:'#fffdf8', weight:9, opacity:.92, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer);
  L.polyline(latlngs, {pane:'route', color:'#1a1714', weight:4, opacity:.95, lineCap:'round', lineJoin:'round', dashArray:solid ? '1 9' : '1 14', interactive:false}).addTo(routeLayer);
}
// the line should end at the dot as drawn, which may have been nudged
function ends(g, it){ const m = it.marker.getLatLng(); return [...g, [m.lat, m.lng]]; }
function redrawRouteEnds(){ if (lastGeom && cur) paint(ends(lastGeom.g, cur), lastGeom.solid); }
drawRoute = async function(it){
  const tok = ++routeTok;
  lastGeom = null; routeLayer.clearLayers();
  if (!it || it.kind === 'hotel') return;
  const g = await routeTo(it);
  if (tok !== routeTok) return;                 // they've moved on to another dot
  // dotted along the streets when the router answered; a sparser straight
  // line when it didn't, so it doesn't pretend to be a real route
  lastGeom = g ? {g, solid:true} : {g:[[HOTEL.lat, HOTEL.lon]], solid:false};
  paint(ends(lastGeom.g, it), lastGeom.solid);
};

const hint = $('#hint'); if (hint) hint.textContent = TOUCH ? 'Tap any dot or star to read about it' : 'Point at any dot or star to read about it';
setTimeout(() => {
  map.invalidateSize(); showAll(); spread();
  // a link can point straight at one place: nyc2026…/#met
  const want = byId(decodeURIComponent(location.hash.slice(1)));
  if (want) openCard(want, true);
}, 60);
})();
