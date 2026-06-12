/* NM 2026 Primary precinct viz. Static, no build step. */

const MAPBOX_TOKEN =
  "pk.eyJ1IjoiYWdlbmRhZGlnaXRhbCIsImEiOiJjbXFhajJlYjYwNzE3MndwenU0ZXBoOGx4In0.R9JL-IBJPFkBmsPWEJlcQw";

const NM_BOUNDS = [[-109.2, 31.2], [-102.9, 37.1]];
const NO_DATA_COLOR = "#3a3f4b";

const state = {
  race: null,        // race id
  raceData: null,    // loaded race JSON
  geo: null,         // precincts FeatureCollection (mutated in place)
  mode: "winner",    // winner | candidate | turnout
  party: "R",        // R | D  (winner & candidate modes)
  candidate: null,   // candidate key (candidate mode)
  county: "ALL",
};

const $ = (id) => document.getElementById(id);

/* ---------- color helpers ---------- */
function hexToRgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/* diverging ramp for turnout: blue (D lead) <- white -> red (R lead). diff in [-1,1] */
function turnoutColor(diff) {
  if (diff >= 0) return lerpColor("#f7f7f7", "#b2182b", Math.min(diff, 1));
  return lerpColor("#f7f7f7", "#2166ac", Math.min(-diff, 1));
}

/* ---------- candidate lookups ---------- */
function candByKey(key) {
  return state.raceData.candidates.find((c) => c.key === key);
}
function candsForParty(p) {
  return state.raceData.candidates.filter((c) => c.party === p);
}

/* ---------- per-feature styling ---------- */
function styleFeatures() {
  const { mode, party, candidate, county, raceData, geo } = state;
  const results = raceData.results;

  for (const f of geo.features) {
    const p = f.properties;
    const r = results[p.join_id];
    let color = NO_DATA_COLOR;
    let opacity = r ? 0.85 : 0.12;

    // County-isolate mode: show only the selected county's precincts
    // (colored by winner of the selected primary), hide the rest.
    if (mode === "county") {
      if (county !== "ALL" && p.COUNTY_NAM !== county) {
        p._color = NO_DATA_COLOR;
        p._opacity = 0;
        continue;
      }
      const w = r && r.winner[party];
      if (w) {
        color = candByKey(w).color;
        opacity = 0.35 + 0.65 * Math.min(r.margin[party] / 0.5, 1);
      } else {
        color = NO_DATA_COLOR;
        opacity = r ? 0.15 : 0.12;
      }
      p._color = color;
      p._opacity = opacity;
      continue;
    }

    if (r) {
      if (mode === "winner") {
        const w = r.winner[party];
        if (w) {
          color = candByKey(w).color;
          // margin in [0,1]; emphasize: full color by 50% margin
          opacity = 0.35 + 0.65 * Math.min(r.margin[party] / 0.5, 1);
        } else {
          color = NO_DATA_COLOR; opacity = 0.15;
        }
      } else if (mode === "candidate") {
        const c = candByKey(candidate);
        const ptot = r.party_totals[c.party];
        const votes = r.counts[c.key] || 0;
        const share = ptot ? votes / ptot : 0;
        color = lerpColor("#f7f7f7", c.color, share);
        opacity = ptot ? 0.85 : 0.15;
      } else if (mode === "turnout") {
        const tot = r.total;
        const diff = tot ? (r.party_totals.R - r.party_totals.D) / tot : 0;
        color = turnoutColor(diff);
        opacity = tot ? 0.85 : 0.15;
      }
    }

    // county dimming
    if (county !== "ALL" && p.COUNTY_NAM !== county) opacity *= 0.12;

    p._color = color;
    p._opacity = opacity;
  }

  if (map.getSource("precincts")) map.getSource("precincts").setData(geo);
  renderLegend();
}

/* ---------- legend ---------- */
function renderLegend() {
  const el = $("legend");
  const { mode, party, candidate, raceData, county } = state;
  if (mode === "winner" || mode === "county") {
    const rows = candsForParty(party)
      .map((c) => `<div class="legend-row"><span class="swatch" style="background:${c.color}"></span>${c.name}</div>`)
      .join("");
    const hint = mode === "county"
      ? (county === "ALL"
          ? `<p class="muted">Pick a county below to isolate it.</p>`
          : `<p class="muted">Showing ${county} only. Shade = win margin.</p>`)
      : `<p class="muted">Shade intensity = win margin.</p>`;
    const head = mode === "county" ? `${raceData.party_labels[party]} winner — by county` : `${raceData.party_labels[party]} winner`;
    el.innerHTML = `<h3>${head}</h3>${rows}
      <div class="legend-row"><span class="swatch" style="background:${NO_DATA_COLOR}"></span>no data / no shape</div>
      ${hint}`;
  } else if (mode === "candidate") {
    const c = candByKey(candidate);
    el.innerHTML = `<h3>${c.name} — vote share</h3>
      <div class="legend-grad" style="background:linear-gradient(90deg,#f7f7f7,${c.color})"></div>
      <div class="legend-scale"><span>0%</span><span>100% of ${raceData.party_labels[c.party]} vote</span></div>`;
  } else {
    el.innerHTML = `<h3>Party turnout</h3>
      <div class="legend-grad" style="background:linear-gradient(90deg,#2166ac,#f7f7f7,#b2182b)"></div>
      <div class="legend-scale"><span>Dem lead</span><span>even</span><span>Rep lead</span></div>
      <p class="muted">Share of ballots cast in each party's primary.</p>`;
  }
}

/* ---------- race-wide totals ---------- */
function renderRaceTotals() {
  const el = $("race-totals");
  const cands = state.raceData.candidates;
  // In County mode with a county chosen, totals reflect just that county.
  const scoped = state.mode === "county" && state.county !== "ALL";
  const totals = Object.fromEntries(cands.map((c) => [c.key, 0]));
  for (const r of Object.values(state.raceData.results)) {
    if (scoped && r.county !== state.county) continue;
    for (const c of cands) totals[c.key] += r.counts[c.key] || 0;
  }
  // Each party is its own primary contest — group + subtotal per party,
  // never pool across parties (that would imply they ran against each other).
  const present = ["R", "D"].filter((p) => cands.some((c) => c.party === p));
  const heading = scoped ? `Race totals — ${state.county}` : "Race totals — all precincts";
  let html = `<h3>${heading}</h3>`;
  for (const p of present) {
    const pc = cands.filter((c) => c.party === p);
    const sub = pc.reduce((a, c) => a + totals[c.key], 0);
    html += `<div class="totals-party">${state.raceData.party_labels[p]} primary</div>`;
    html += pc
      .map((c) => ({ c, v: totals[c.key] }))
      .sort((a, b) => b.v - a.v)
      .map(({ c, v }) => {
        const pct = sub ? ((v / sub) * 100).toFixed(1) : "0.0";
        return `<div class="totals-row">
          <span><span class="dot" style="background:${c.color}"></span>${c.name}</span>
          <span>${v.toLocaleString()}<span class="pct">${pct}%</span></span></div>`;
      })
      .join("");
    html += `<div class="totals-sum"><span>${state.raceData.party_labels[p]} total</span><span>${sub.toLocaleString()}</span></div>`;
  }
  el.innerHTML = html;
}

/* ---------- popup ---------- */
function precinctPopupHTML(joinId) {
  const r = state.raceData.results[joinId];
  if (!r) return `<div class="popup-title">${joinId}</div><p>No results.</p>`;
  let html = `<div class="popup-title">${r.county} — Precinct ${r.precinct}</div>`;
  for (const party of ["R", "D"]) {
    html += `<div class="popup-party">${state.raceData.party_labels[party]} primary</div>`;
    for (const c of candsForParty(party)) {
      const raw = r.counts[c.key];
      const isWin = r.winner[party] === c.key;
      const val = raw == null ? 0 : raw;  // '*' / blank -> 0
      html += `<div class="popup-row ${isWin ? "win" : ""}">
        <span><span class="dot" style="background:${c.color}"></span>${c.name}${isWin ? " ✓" : ""}</span>
        <span>${val}</span></div>`;
    }
    html += `<div class="popup-total"><span>Total</span><span>${r.party_totals[party]}</span></div>`;
  }
  return html;
}

/* ---------- map ---------- */
mapboxgl.accessToken = MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  bounds: NM_BOUNDS,
  fitBoundsOptions: { padding: 20 },
});
map.addControl(new mapboxgl.NavigationControl(), "top-right");

let hoverPopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

async function init() {
  const [races, geo] = await Promise.all([
    fetch("data/races.json").then((r) => r.json()),
    fetch("data/precincts.json").then((r) => r.json()),
  ]);
  state.geo = geo;

  // race dropdown, grouped via optgroups
  const sel = $("race");
  const order = ["Statewide", "Congressional", "House", "Senate"];
  const groups = {};
  races.races.forEach((r) => (groups[r.group || "Other"] ||= []).push(r));
  const groupNames = [...new Set([...order, ...Object.keys(groups)])].filter((g) => groups[g]);
  groupNames.forEach((g) => {
    const og = document.createElement("optgroup");
    og.label = g;
    groups[g].forEach((r) => {
      const o = document.createElement("option");
      o.value = r.id; o.textContent = r.label + (r.available ? "" : " (no data yet)");
      o.disabled = !r.available;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  const first = races.races.find((r) => r.available);
  sel.value = first.id;

  await loadRace(first.id);

  map.on("load", () => {
    map.addSource("precincts", { type: "geojson", data: state.geo });
    map.addLayer({
      id: "precinct-fill", type: "fill", source: "precincts",
      paint: { "fill-color": ["get", "_color"], "fill-opacity": ["get", "_opacity"] },
    });
    map.addLayer({
      id: "precinct-line", type: "line", source: "precincts",
      paint: {
        "line-color": "#1a1a1a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 9, 0.9, 12, 1.6, 15, 2.6],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 0.8],
      },
    });
    styleFeatures();
    map.on("click", "precinct-fill", (e) => {
      const f = e.features[0];
      hoverPopup.setLngLat(e.lngLat).setHTML(precinctPopupHTML(f.properties.join_id)).addTo(map);
    });
    map.on("mouseenter", "precinct-fill", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "precinct-fill", () => (map.getCanvas().style.cursor = ""));
    $("loading").classList.add("hidden");
  });

  wireControls();
}

async function loadRace(raceId) {
  state.race = raceId;
  state.raceData = await fetch(`data/${raceId}.json`).then((r) => r.json());
  state.candidate = state.raceData.candidates[0].key;
  state.party = "R";
  $("reporting").textContent = state.raceData.reporting || "";
  populateParty();
  populateCandidate();
  populateCounty();
  renderRaceTotals();
}

/* ---------- control population ---------- */
function populateParty() {
  const sel = $("party");
  sel.innerHTML = "";
  // only parties that actually have candidates in this race
  const present = ["R", "D"].filter((p) =>
    state.raceData.candidates.some((c) => c.party === p)
  );
  if (!present.includes(state.party)) state.party = present[0];
  for (const p of present) {
    const o = document.createElement("option");
    o.value = p; o.textContent = state.raceData.party_labels[p];
    sel.appendChild(o);
  }
  sel.value = state.party;
}
function populateCandidate() {
  const sel = $("candidate");
  sel.innerHTML = "";
  state.raceData.candidates.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.key; o.textContent = `${c.name} (${c.party})`;
    sel.appendChild(o);
  });
  sel.value = state.candidate;
}
function populateCounty() {
  const sel = $("county");
  sel.innerHTML = "";
  const counties = [...new Set(Object.values(state.raceData.results).map((r) => r.county))].sort();
  const all = document.createElement("option");
  all.value = "ALL"; all.textContent = "All counties";
  sel.appendChild(all);
  counties.forEach((c) => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  sel.value = "ALL";
  state.county = "ALL";
}

/* ---------- county zoom ---------- */
function zoomCounty(county) {
  if (county === "ALL") { map.fitBounds(NM_BOUNDS, { padding: 20 }); return; }
  let minX = 180, minY = 90, maxX = -180, maxY = -90, found = false;
  for (const f of state.geo.features) {
    if (f.properties.COUNTY_NAM !== county) continue;
    found = true;
    eachCoord(f.geometry, (x, y) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
  }
  if (found) map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40 });
}
// Fit the map to the precincts that belong to the current race.
// District races (CD/HD/SD) zoom in tight; statewide races fill the state.
function fitRaceBounds() {
  const res = state.raceData.results;
  let minX = 180, minY = 90, maxX = -180, maxY = -90, found = false;
  for (const f of state.geo.features) {
    if (!res[f.properties.join_id]) continue;
    found = true;
    eachCoord(f.geometry, (x, y) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
  }
  if (found) map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 30, duration: 700 });
  else map.fitBounds(NM_BOUNDS, { padding: 20 });
}

function eachCoord(geom, cb) {
  const walk = (a) => {
    if (typeof a[0] === "number") { cb(a[0], a[1]); return; }
    a.forEach(walk);
  };
  walk(geom.coordinates);
}

function findPrecinct(county, num) {
  const f = state.geo.features.find(
    (f) => f.properties.COUNTY_NAM === county && String(f.properties.VTD_NUM) === String(num)
  );
  if (!f) return false;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  eachCoord(f.geometry, (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 120, maxZoom: 14 });
  hoverPopup
    .setLngLat([(minX + maxX) / 2, (minY + maxY) / 2])
    .setHTML(precinctPopupHTML(f.properties.join_id))
    .addTo(map);
  return true;
}

/* ---------- wiring ---------- */
function syncModeControls() {
  $("party-ctl").hidden = state.mode === "turnout";
  $("candidate-ctl").hidden = state.mode !== "candidate";
}

function wireControls() {
  $("race").addEventListener("change", async (e) => {
    await loadRace(e.target.value);
    styleFeatures();
    fitRaceBounds();
  });
  $("mode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    $("mode-seg").querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    syncModeControls();
    if (state.mode === "county" && state.county !== "ALL") zoomCounty(state.county);
    styleFeatures();
    renderRaceTotals();
  });
  $("party").addEventListener("change", (e) => { state.party = e.target.value; styleFeatures(); });
  $("candidate").addEventListener("change", (e) => { state.candidate = e.target.value; styleFeatures(); });
  $("county").addEventListener("change", (e) => {
    state.county = e.target.value;
    zoomCounty(state.county);
    styleFeatures();
    renderRaceTotals();
  });
  $("precinct").addEventListener("change", (e) => {
    const num = e.target.value;
    if (!num) return;
    if (state.county === "ALL") { alert("Pick a county first to locate a precinct."); return; }
    if (!findPrecinct(state.county, num)) alert(`No precinct ${num} shape in ${state.county}.`);
  });
  syncModeControls();
}

init().catch((err) => {
  console.error(err);
  $("loading").textContent = "Error loading data — see console.";
});
