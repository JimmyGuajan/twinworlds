/* TwinWorlds – guided mission experience */
(function () {
  const { sites: CURATED, targets: TARGETS, generated } = window.TW_DATA;
  const { KEYS, CLIMATE_KEYS, PROFILES } = TW;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ICON = { aridity: "🏜️", cold: "🥶", swing: "🌡️", thin_air: "🏔️", radiation: "☀️", light: "🌗", basalt: "🌋", regolith: "🪨", ice: "🧊",
    impact: "☄️", caves: "🕳️", salts: "🧂", sediment: "🏞️", barren: "🚫", relief: "⛰️" };
  const PROFILE_ICON = { balanced: "⚖️", habitat: "🏗️", isru: "🧊", mobility: "🛞", astrobio: "🧬", caves: "🕳️", power: "☀️" };
  const TEX = { Earth: "assets/earth.jpg", Moon: "assets/moon.jpg", Mars: "assets/mars.jpg" };
  const POWER_PARAMS = "T2M,T2M_RANGE,T2M_MIN,T2M_MAX,PRECTOTCORR,RH2M,PS,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX";
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const state = {
    lang: (navigator.language || "es").startsWith("es") ? "es" : "en",
    stage: "intro", body: "Moon", targetId: null, profile: null,
    mode: "match", tab: "verdict", selectedId: null, scan: null, scanBusy: false,
  };
  CURATED.forEach(s => (s.fp = TW.fingerprint(s)));

  const T = () => I18N[state.lang];
  const FL = k => I18N_FEATURES[state.lang][k];
  const PL = id => I18N_PROFILES[state.lang][id];
  const target = () => TARGETS.find(t => t.id === state.targetId);
  const short = n => n.split(" (")[0];
  const allSites = () => (state.scan ? CURATED.concat(state.scan) : CURATED);
  const isMobile = () => innerWidth <= 820;

  // ---------- color ----------
  const STOPS = ["#27325e", "#2f6fd0", "#25b0a6", "#9fdc5a", "#ffd166"];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function scoreColor(score, lo = 30, hi = 75) {
    const t = TW.clamp((score - lo) / (hi - lo)) * (STOPS.length - 1);
    const i = Math.min(Math.floor(t), STOPS.length - 2), f = t - i;
    const a = hex(STOPS[i]), b = hex(STOPS[i + 1]);
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
  }
  const matchColor = v => (v >= 0.8 ? "var(--good)" : v >= 0.55 ? "var(--warn)" : "var(--bad)");

  // ---------- scoring ----------
  const weights = () => TW.profileWeights(state.profile || "balanced");
  function rank(mode = state.mode, sites = allSites()) {
    const t = target(), w = weights();
    return sites.map(s => {
      const c = TW.compare(s.fp, t, w);
      let value = c.score;
      if (mode === "untapped") value = c.score * (1 - 0.75 * (s.usage ?? 0));
      if (mode === "ready") value = c.score * (0.6 + 0.4 * (s.access ?? 0.5));
      return { site: s, ...c, value };
    }).sort((a, b) => b.value - a.value);
  }

  // ---------- globe ----------
  const gEl = $("#globe");
  const globe = Globe()(gEl)
    .backgroundColor("rgba(0,0,0,0)")
    .globeImageUrl(TEX.Earth)
    .showAtmosphere(true).atmosphereColor("#7aa2ff").atmosphereAltitude(0.16)
    .pointsMerge(false).pointsTransitionDuration(900)
    .pointLat("lat").pointLng("lng").pointAltitude("alt").pointRadius("r").pointColor("color").pointLabel("label")
    .htmlLat("lat").htmlLng("lng").htmlAltitude("alt").htmlElement(d => d.el)
    .ringLat("lat").ringLng("lng").ringColor(() => t => `rgba(255,155,71,${1 - t})`).ringMaxRadius(4).ringPropagationSpeed(2.5).ringRepeatPeriod(1100)
    .arcStartLat("a0").arcStartLng("o0").arcEndLat("a1").arcEndLng("o1").arcColor(() => ["#36c2b4", "#ff9b47"]).arcStroke(0.6)
    .arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2200).arcAltitudeAutoScale(0.4)
    .onPointClick(p => p.onClick && p.onClick())
    .onPointHover(p => { gEl.style.cursor = p ? "pointer" : ""; })
    .onGlobeClick(({ lat, lng }) => {
      if ((state.stage === "verdict" && state.tab === "scan") || state.stage === "earth") scanPoint(lat, lng);
      else if (state.stage === "verdict" && state.tab === "map") heatClick(lat, lng);
    });
  const ctl = globe.controls();
  ctl.autoRotate = true; ctl.autoRotateSpeed = 0.35; ctl.enableDamping = true;
  let currentTex = "Earth";
  function setTexture(body) { if (currentTex !== body) { globe.globeImageUrl(TEX[body]); currentTex = body; } }

  function layoutGlobe() {
    let left = 0, height = innerHeight;
    if (isMobile()) height = state.stage === "intro" ? innerHeight : innerHeight * 0.44;
    else if (state.stage === "intro") left = innerWidth * 0.36;
    else if (state.stage !== "launch") left = 450;
    gEl.style.left = left + "px";
    globe.width(innerWidth - left).height(height);
  }
  addEventListener("resize", layoutGlobe);

  function labelEl(text, cls = "") { const d = document.createElement("div"); d.className = "scene-label " + cls; d.textContent = text; return d; }
  function landerEl() {
    const d = document.createElement("div");
    d.innerHTML = $("#ship").outerHTML.replace('id="ship"', "").replace('class="ship"', 'class="lander"');
    return d.firstElementChild;
  }
  function clearLayers() { globe.pointsData([]).htmlElementsData([]).ringsData([]).arcsData([]); }

  function showTargetsOnGlobe() {
    setTexture(state.body);
    const list = TARGETS.filter(t => t.body === state.body);
    globe.pointsData(list.map(t => ({ lat: t.lat, lng: t.lon, alt: 0.02, r: t.id === state.targetId ? 1.1 : 0.7, color: t.id === state.targetId ? "#ff9b47" : "#ffd9b8",
      label: `<b>${esc(t.name)}</b>`, onClick: () => pickTarget(t.id) })));
    // label only the chosen site (polar sites sit too close together to label all of them)
    const shown = state.targetId ? list.filter(t => t.id === state.targetId) : list.filter((t, i, a) => !a.slice(0, i).some(o => Math.abs(o.lat - t.lat) < 6));
    globe.htmlElementsData(shown.map(t => ({ lat: t.lat, lng: t.lon, alt: 0.03, el: labelEl(short(t.name), t.id === state.targetId ? "win" : "") })));
    globe.ringsData(state.targetId ? [{ lat: target().lat, lng: target().lon }] : []).arcsData([]);
  }

  function showEarthResults(results, focus) {
    setTexture("Earth");
    const lo = Math.min(...results.map(r => r.score)), hi = Math.max(...results.map(r => r.score));
    const win = results[0].site;
    globe.pointsData(results.map(r => {
      const s = r.site, on = s.id === state.selectedId;
      return { lat: s.lat, lng: s.lon, alt: 0.01 + 0.28 * TW.clamp((r.score - lo) / (hi - lo || 1)) ** 1.5, r: on ? 0.75 : 0.42,
        color: on ? "#ff9b47" : scoreColor(r.score, lo, hi), label: `<b>${esc(s.name)}</b><br>${T().twinScore}: ${r.score.toFixed(1)}`,
        onClick: () => selectSite(s.id) };
    }));
    const sel = allSites().find(s => s.id === state.selectedId) || win;
    globe.htmlElementsData([{ lat: sel.lat, lng: sel.lon, alt: 0.02, el: landerEl() }, { lat: sel.lat, lng: sel.lon, alt: 0.02, el: labelEl(sel.name.split(" – ")[0], "win") }]);
    globe.ringsData([{ lat: sel.lat, lng: sel.lon }]).arcsData([]);
    if (focus) globe.pointOfView({ lat: sel.lat, lng: sel.lon, altitude: 1.6 }, 1600);
  }

  // ---------- chrome ----------
  function renderChrome() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i]").forEach(el => (el.textContent = T()[el.dataset.i]));
    document.querySelectorAll("#lang button").forEach(b => b.classList.toggle("on", b.dataset.l === state.lang));
    const idx = { intro: -1, earth: -1, dest: 0, mission: 1, launch: 2, verdict: 3 }[state.stage];
    $("#progress").innerHTML = T().steps.map((s, i) => `<li class="${i === idx ? "on" : i < idx ? "done" : ""}"><i>${i < idx ? "✓" : i + 1}</i>${s}</li>`).join("");
    document.body.dataset.stage = state.stage;
  }
  function go(stage) {
    state.stage = stage; renderChrome(); layoutGlobe(); renderPanel();
    $("#hint").hidden = true;
  }

  // ---------- panel per stage ----------
  function renderPanel() {
    const p = $("#panel");
    if (state.stage === "dest") {
      const list = TARGETS.filter(t => t.body === state.body);
      p.innerHTML = `<div class="p-body">
        <h2 class="p-title">${T().chooseBody}</h2>
        <div class="bodies">${["Moon", "Mars"].map(b => `<button class="body-btn ${b === state.body ? "on" : ""}" data-b="${b}"><span class="orb ${b}"></span>${b === "Moon" ? T().moon : T().mars}</button>`).join("")}</div>
        <p class="p-sub">${T().chooseSite}</p>
        <div class="sites">${list.map(t => `<button class="site-btn ${t.id === state.targetId ? "on" : ""}" data-id="${t.id}"><b>${esc(short(t.name))}</b><span>${esc(I18N_TARGET_TAG[state.lang][t.id])}</span></button>`).join("")}</div>
      </div>
      <div class="p-foot"><button class="btn ghost" id="backBtn">${T().back}</button><button class="btn" id="nextBtn" ${state.targetId ? "" : "disabled"}>${T().next} →</button></div>`;
      p.querySelectorAll(".body-btn").forEach(b => (b.onclick = () => { state.body = b.dataset.b; state.targetId = null; showTargetsOnGlobe(); globe.pointOfView({ lat: 0, lng: 0, altitude: 2.4 }, 1000); renderPanel(); }));
      p.querySelectorAll(".site-btn").forEach(b => (b.onclick = () => pickTarget(b.dataset.id)));
      $("#backBtn").onclick = goHome;
      $("#nextBtn").onclick = () => go("mission");
    }
    if (state.stage === "mission") {
      const t = target();
      p.innerHTML = `<div class="p-body">
        <div class="chosen"><span class="orb ${t.body}" style="width:22px;height:22px;border-radius:50%;display:inline-block"></span><span><b>${esc(short(t.name))}</b> · ${t.body === "Moon" ? T().moon : T().mars}</span></div>
        <h2 class="p-title" style="margin-bottom:14px">${T().chooseMission}</h2>
        <div class="missions">${Object.keys(PROFILES).map(id => `<button class="mission ${id === state.profile ? "on" : ""}" data-id="${id}"><span class="ic">${PROFILE_ICON[id]}</span><b>${PL(id)}</b><span>${I18N_PROFILE_DESC[state.lang][id]}</span></button>`).join("")}</div>
      </div>
      <div class="p-foot"><button class="btn ghost" id="backBtn">${T().back}</button><button class="btn big" id="launchBtn" ${state.profile ? "" : "disabled"}>🚀 ${T().launch}</button></div>`;
      p.querySelectorAll(".mission").forEach(b => (b.onclick = () => { state.profile = b.dataset.id; renderPanel(); }));
      $("#backBtn").onclick = () => go("dest");
      $("#launchBtn").onclick = launch;
    }
    if (state.stage === "verdict") renderVerdictPanel();
    if (state.stage === "earth") renderEarthPanel();
  }

  function pickTarget(id) {
    const t = TARGETS.find(x => x.id === id);
    state.targetId = id; state.body = t.body; ctl.autoRotate = false;
    showTargetsOnGlobe();
    globe.pointOfView({ lat: Math.abs(t.lat) > 80 ? Math.sign(t.lat) * 70 : t.lat, lng: t.lon, altitude: 1.5 }, 1200);
    if (state.stage === "dest") renderPanel();
  }
  function goHome() {
    history.replaceState(null, "", location.pathname);
    clearLayers(); setTexture("Earth"); ctl.autoRotate = true;
    globe.pointOfView({ lat: 10, lng: -40, altitude: 2.3 }, 1000);
    go("intro");
  }

  // ---------- launch sequence ----------
  async function typeLine(html, cls = "") {
    const body = $("#termBody");
    body.querySelectorAll(".cur").forEach(e => e.classList.remove("cur"));
    const line = document.createElement("div"); line.className = "cur " + cls; body.appendChild(line);
    const text = html.replace(/<[^>]+>/g, "");
    for (let i = 1; i <= text.length; i += 3) { line.textContent = "> " + text.slice(0, i); await sleep(12); }
    line.innerHTML = "> " + html;
    await sleep(260);
  }
  function globeCenter() { const r = gEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight) / 2 }; }
  function flyShip(from, to, rot, scale, ms) {
    return $("#ship").animate([
      { transform: `translate(${from.x - 32}px, ${from.y - 32}px) rotate(${rot}deg) scale(${scale[0]})`, opacity: 1 },
      { transform: `translate(${to.x - 32}px, ${to.y - 32}px) rotate(${rot}deg) scale(${scale[1]})`, opacity: 1 },
    ], { duration: ms, easing: "cubic-bezier(.55,.05,.35,1)", fill: "forwards" }).finished;
  }

  async function launch() {
    const t = target(), w = weights();
    state.mode = "match"; state.tab = "verdict"; state.scan = null;
    const results = rank("match", CURATED);
    state.selectedId = results[0].site.id;
    go("launch");
    $("#termBody").innerHTML = ""; $("#terminal").hidden = false;
    ctl.autoRotate = false;
    globe.pointOfView({ lat: Math.abs(t.lat) > 80 ? Math.sign(t.lat) * 75 : t.lat, lng: t.lon, altitude: 1.2 }, 1000);

    const L = T().log;
    await typeLine(`<span class="k">${L.target(esc(short(t.name)))}</span>`);
    const prov = t.prov || {};
    for (const k of ["relief", "ice", "light"]) if (prov[k]?.kind === "measured") await typeLine(`${ICON[k]} ${esc(prov[k].text)}`);
    await typeLine(L.profile(PL(state.profile)));

    // take-off from the target world
    const ship = $("#ship");
    await flyShip(globeCenter(), { x: innerWidth + 80, y: -80 }, 45, [0.6, 1.4], 1300);
    $("#flash").classList.add("on");
    await sleep(350);
    clearLayers(); setTexture("Earth");
    globe.pointOfView({ lat: results[0].site.lat, lng: results[0].site.lon - 70, altitude: 3 }, 0);
    $("#flash").classList.remove("on");

    await typeLine(L.power(CURATED.length));
    await typeLine(L.dem(CURATED.length));
    await typeLine(L.compare(KEYS.filter(k => w[k] > 0).length, CURATED.length));
    showEarthResults(results, false);
    globe.htmlElementsData([]).ringsData([]);
    await typeLine(`<span class="ok">${L.best(esc(results[0].site.name), results[0].score.toFixed(1))}</span>`);
    await typeLine(L.land);

    // landing on Earth's best twin
    globe.pointOfView({ lat: results[0].site.lat, lng: results[0].site.lon, altitude: 1.6 }, 2200);
    await flyShip({ x: -80, y: -80 }, globeCenter(), 135, [1.4, 0.3], 2000);
    ship.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    await sleep(500);
    $("#terminal").hidden = true;
    go("verdict");
    showEarthResults(results, true);
    writeHash();
  }

  // ---------- verdict + tabs ----------
  function selectSite(id) {
    state.selectedId = id; state.tab = "verdict";
    renderVerdictPanel();
    showEarthResults(rank(), true);
  }

  function earthDetail(k, s) {
    const pw = s.power || {}, es = state.lang === "es";
    const clim = TW.climateFromPower(pw, s.elev);
    switch (k) {
      case "aridity": return pw.precip == null ? "" : `${(pw.precip * 365).toFixed(0)} mm/${es ? "año" : "yr"} · HR ${pw.rh?.toFixed(0)}% · NASA POWER`;
      case "cold": return pw.t2m == null ? "" : `${es ? "T media" : "Mean T"} ${pw.t2m.toFixed(1)} °C · NASA POWER`;
      case "swing": return pw.t2m_range == null ? "" : `Δ ${es ? "diaria" : "daily"} ${pw.t2m_range.toFixed(1)} °C · NASA POWER`;
      case "thin_air": return clim._ps == null ? "" : `${clim._ps.toFixed(1)} kPa · ${Math.round(s.elev ?? 0)} m · NASA POWER + DEM`;
      case "radiation": return pw.sw == null ? "" : `${pw.sw.toFixed(1)} kWh/m²/d · UV ${pw.uv?.toFixed(1)} · NASA POWER`;
      case "light": return pw.sw_min == null ? "" : `${es ? "mes oscuro/brillante" : "dark/bright month"} ${(pw.sw_min / pw.sw_max).toFixed(2)} · NASA POWER`;
      case "relief": return s.relief_m == null ? "" : `${Math.round(s.relief_m)} m ${es ? "en 15 km" : "within 15 km"} · Copernicus DEM`;
      case "barren": if (s.ndvi != null) return `NDVI ${s.ndvi.toFixed(2)} · MODIS MOD13Q1 (ORNL DAAC)`; // else falls through
      default: return s.scanned ? (es ? "sin datos: requiere campo" : "no data: needs fieldwork") : (es ? "estimado de literatura geológica" : "estimate from geologic literature");
    }
  }
  function targetDetail(k, t) {
    const p = t.prov?.[k];
    return p ? p.text : (state.lang === "es" ? "literatura de la misión" : "mission literature");
  }

  function ring(score) {
    const r = 38, c = 2 * Math.PI * r, p = TW.clamp(score / 100);
    return `<svg class="ring" viewBox="0 0 92 92"><circle cx="46" cy="46" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
      <circle cx="46" cy="46" r="${r}" fill="none" stroke="${scoreColor(score)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 46 46)"/>
      <text x="46" y="50" text-anchor="middle" font-size="24">${score.toFixed(0)}</text><text class="lbl" x="46" y="66" text-anchor="middle" font-size="9">/ 100</text></svg>`;
  }

  let radar = null;
  const helpOpen = new Set(); // tabs whose "?" help box the user has opened
  function renderVerdictPanel() {
    const p = $("#panel"), t = target();
    const tabs = ["verdict", "top", "camp", "map", "evidence", "scan"];
    p.innerHTML = `<nav class="tabs">${tabs.map(k => `<button data-tab="${k}" class="${k === state.tab ? "on" : ""}">${T().tabs[k]}</button>`).join("")}</nav>
      <div class="p-body" id="tabBody"></div>
      <div class="p-foot"><button class="btn ghost" id="newBtn">↺ ${T().newMission}</button><button class="btn" id="cardBtn">⬇ ${T().card}</button></div>`;
    p.querySelectorAll(".tabs button").forEach(b => (b.onclick = () => {
      const prev = state.tab;
      state.tab = b.dataset.tab; renderVerdictPanel();
      $("#hint").hidden = state.tab !== "scan";
      if (state.peek) unpeek(false);
      if (["camp", "map"].includes(prev) && prev !== state.tab) showEarthResults(rank(), true);
    }));
    $("#hint").textContent = state.lang === "es" ? "🛰 Haz clic en cualquier punto del globo" : "🛰 Click any point on the globe";
    $("#newBtn").onclick = () => { state.profile = null; state.scan = null; clearLayers(); go("dest"); pickTarget(state.targetId); };
    const results = rank();
    $("#cardBtn").onclick = () => exportCard(results.find(r => r.site.id === state.selectedId) || results[0]);
    ({ verdict: tabVerdict, top: tabTop, camp: tabCamp, map: tabMap, evidence: tabEvidence, scan: tabScan })[state.tab](results, t);
    const tab = state.tab;
    $("#tabBody").insertAdjacentHTML("afterbegin",
      `<details class="about" ${helpOpen.has(tab) ? "open" : ""}><summary>❓ ${T().helpQ}</summary><p>${T().help[tab]}</p></details>`);
    $("#tabBody .about").addEventListener("toggle", e => (e.target.open ? helpOpen.add(tab) : helpOpen.delete(tab)));
  }

  function tabVerdict(results, t) {
    const r = results.find(x => x.site.id === state.selectedId) || results[0];
    const s = r.site, w = weights(), pos = results.indexOf(r) + 1;
    const isWin = pos === 1;
    const usage = s.scanned ? "" : s.usage <= 0.2 ? `<span class="badge new">${T().newCandidate}</span>` : s.usage >= 0.6 ? `<span class="badge est">${T().established}</span>` : "";
    const scored = KEYS.filter(k => r.per[k] != null && w[k] > 0);
    const reasons = scored.filter(k => t[k] >= 0.3 && r.per[k] >= 0.7).sort((a, b) => w[b] * r.per[b] - w[a] * r.per[a]).slice(0, 3);
    const gaps = scored.filter(k => r.per[k] < 0.6).sort((a, b) => w[b] * (1 - r.per[b]) - w[a] * (1 - r.per[a])).slice(0, 2);
    const lead = isWin ? T().verdictLead(PL(state.profile), esc(short(t.name)))
      : `#${pos} ${T().of} ${results.length} · ${esc(short(t.name))} · ${PL(state.profile)}`;
    $("#tabBody").innerHTML = `
      <p class="lead">${lead}</p>
      <div class="winner">${ring(r.score)}<div><h2>${esc(s.name)}</h2><div class="country">${esc(s.country)} ${usage}</div></div></div>
      <div class="sec">✅ ${T().why}</div>
      <ul class="reasons">${reasons.map(k => `<li><span class="ic">${ICON[k]}</span><span><b>${FL(k)}</b><small>${esc(earthDetail(k, s))}</small><small>${t.body === "Moon" ? T().moon : T().mars}: ${esc(targetDetail(k, t))}</small></span><span class="pct" style="color:${matchColor(r.per[k])}">${Math.round(r.per[k] * 100)}%</span></li>`).join("") || "<li>—</li>"}</ul>
      <div class="sec">⚠️ ${T().cannot}</div>
      <ul class="reasons bad">${gaps.map(k => `<li><span class="ic">${ICON[k]}</span><span><b>${FL(k)}</b><small>${esc(earthDetail(k, s))}</small></span><span class="pct" style="color:${matchColor(r.per[k])}">${Math.round(r.per[k] * 100)}%</span></li>`).join("") || "<li>—</li>"}</ul>
      <div class="radar-wrap"><canvas id="radar"></canvas></div>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      ${reverseHtml(s)}
      <div class="sec">🛰 ${T().dataUsed}</div>
      <div class="chips">${["NASA POWER", "Copernicus DEM", ...new Set(Object.values(t.prov || {}).filter(p => p.kind === "measured").map(p => p.text.split(":")[0]))].map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div>`;
    drawRadar(s, t);
    bindReverse();
  }

  function drawRadar(s, t) {
    if (radar) radar.destroy();
    radar = new Chart($("#radar"), {
      type: "radar",
      data: { labels: KEYS.map(FL), datasets: [
        { label: short(t.name), data: KEYS.map(k => t[k]), borderColor: "#ff9b47", backgroundColor: "rgba(255,155,71,.14)", pointRadius: 0, borderWidth: 2 },
        { label: s.name.split(" – ")[0], data: KEYS.map(k => s.fp[k]), borderColor: "#36c2b4", backgroundColor: "rgba(54,194,180,.25)", pointRadius: 0, borderWidth: 2, spanGaps: true },
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        scales: { r: { min: 0, max: 1, ticks: { display: false }, grid: { color: "rgba(122,162,255,.15)" }, angleLines: { color: "rgba(122,162,255,.15)" }, pointLabels: { color: "#93a1bd", font: { size: 9 } } } },
        plugins: { legend: { labels: { color: "#eef2fa", boxWidth: 10, font: { size: 11 } } } } },
    });
  }

  function tabTop(results) {
    const lo = Math.min(...results.map(r => r.score)), hi = Math.max(...results.map(r => r.score));
    $("#tabBody").innerHTML = `
      <div class="seg">${["match", "untapped", "ready"].map(m => `<button data-m="${m}" class="${m === state.mode ? "on" : ""}">${T().modes[m]}</button>`).join("")}</div>
      <p class="help">${T().modeHelp[state.mode]}</p>
      <ol class="rank">${results.slice(0, 10).map(r => {
        const s = r.site, b = s.scanned ? "" : s.usage <= 0.2 ? `<span class="badge new">${T().newCandidate}</span>` : "";
        return `<li data-id="${s.id}" class="${s.id === state.selectedId ? "on" : ""}"><div><b>${esc(s.name)}${b}</b><small>${esc(s.country)}</small>
          <div class="bar"><i style="width:${TW.clamp(r.value / 80) * 100}%;background:${scoreColor(r.score, lo, hi)}"></i></div></div><span class="v">${r.value.toFixed(0)}</span></li>`;
      }).join("")}</ol>
      <button class="btn ghost" id="csvBtn" style="margin-top:10px">⬇ ${T().csv}</button>`;
    document.querySelectorAll(".seg button").forEach(b => (b.onclick = () => {
      state.mode = b.dataset.m; const res = rank(); state.selectedId = res[0].site.id;
      renderVerdictPanel(); showEarthResults(res, true); writeHash();
    }));
    document.querySelectorAll(".rank li").forEach(li => (li.onclick = () => selectSite(li.dataset.id)));
    $("#csvBtn").onclick = () => exportCSV(results);
  }

  function campaign() {
    const pool = rank("match", CURATED);
    return { camp: TW.buildCampaign(pool, target(), weights(), 3), single: pool[0] };
  }
  function drawCampaignArcs(camp) {
    const s = camp.chosen.map(c => c.site);
    globe.arcsData(s.map((a, i) => { const b = s[(i + 1) % s.length]; return { a0: a.lat, o0: a.lon, a1: b.lat, o1: b.lon }; }));
    globe.ringsData(s.map(x => ({ lat: x.lat, lng: x.lon })));
    globe.htmlElementsData(s.map((x, i) => ({ lat: x.lat, lng: x.lon, alt: 0.02, el: labelEl(`${i + 1}. ${x.name.split(" – ")[0]}`, "win") })));
    const lat = s.reduce((a, x) => a + x.lat, 0) / s.length, lng = s.reduce((a, x) => a + x.lon, 0) / s.length;
    globe.pointOfView({ lat, lng, altitude: 2.6 }, 1500);
  }
  function tabCamp(_, t) {
    const { camp, single } = campaign(), w = weights();
    const tot = KEYS.reduce((a, k) => a + w[k], 0);
    const singleCov = 100 * KEYS.reduce((a, k) => a + w[k] * (single.per[k] ?? 0), 0) / tot;
    const roles = new Map(camp.chosen.map(c => [c, []]));
    KEYS.forEach(k => { const o = camp.owner[k]; if (o.site && w[k] > 0 && o.value >= 0.7 && t[k] >= 0.3) roles.get(o.site).push(k); });
    $("#tabBody").innerHTML = `<h2 class="p-title">🧩 ${T().campTitle}</h2>
      <p class="p-sub">${T().campLead(camp.coverage.toFixed(0), singleCov.toFixed(0))}</p>
      <div class="camp">${camp.chosen.map((c, i) => `<div><b>${i + 1}. ${esc(c.site.name)}</b><small>${esc(c.site.country)} · ${c.score.toFixed(0)}/100</small>
        <small>${T().covers}: ${roles.get(c).map(k => ICON[k] + " " + FL(k)).join(", ") || "—"}</small></div>`).join("")}</div>
      <div class="covbars">${KEYS.filter(k => w[k] > 0).map(k => { const v = camp.owner[k].value; return `<div class="row"><span>${ICON[k]} ${FL(k)}</span><div class="track"><i style="width:${v * 100}%;background:${matchColor(v)}"></i></div><span>${Math.round(v * 100)}</span></div>`; }).join("")}</div>
      <p class="foot-note">${T().beyond}</p>`;
    drawCampaignArcs(camp);
  }

  function tabEvidence(results, t) {
    const r = results.find(x => x.site.id === state.selectedId) || results[0], s = r.site;
    const kindOf = k => t.prov?.[k]?.kind || "literature";
    const earthKind = k => (CLIMATE_KEYS.includes(k) || k === "relief" || (k === "barren" && s.ndvi != null) ? "measured" : "literature");
    $("#tabBody").innerHTML = `<h2 class="p-title">🔬 ${T().evTitle}</h2>
      <div class="sec">${T().evTarget}: ${esc(short(t.name))}</div>
      <table class="ev">${KEYS.map(k => `<tr><td>${ICON[k]} ${FL(k)}</td><td><span class="badge ${kindOf(k)}">${T().kinds[kindOf(k)]}</span><div class="src">${esc(targetDetail(k, t))}</div></td><td class="v">${t[k].toFixed(2)}</td></tr>`).join("")}</table>
      <div class="sec">${T().evEarth}: ${esc(s.name)}</div>
      <table class="ev">${KEYS.map(k => `<tr><td>${ICON[k]} ${FL(k)}</td><td><span class="badge ${earthKind(k)}">${T().kinds[earthKind(k)]}</span><div class="src">${esc(earthDetail(k, s))}</div></td><td class="v">${s.fp[k] == null ? "?" : s.fp[k].toFixed(2)}</td></tr>`).join("")}</table>
      <p class="foot-note">${T().beyond}<br>Dataset: ${esc(generated)}</p>`;
  }

  function tabScan(results) {
    const sc = state.scan;
    let box = "";
    if (state.scanBusy) box = `<div class="scanbox busy">${T().scanning}</div>`;
    else if (sc) {
      const r = results.find(x => x.site.id === sc.id);
      const pos = rank("match", CURATED.concat(sc)).findIndex(x => x.site.id === sc.id) + 1;
      box = `<div class="scanbox"><b>📍 ${sc.lat.toFixed(3)}°, ${sc.lon.toFixed(3)}°</b> · ${Math.round(sc.elev ?? 0)} m<br>${T().scanResult(r.score.toFixed(1), pos, CURATED.length + 1)}
        <p class="help" style="margin-top:8px">${T().scanAxes}</p><button class="btn" id="seeScan">→ ${T().tabs.verdict}</button>${reverseHtml(sc)}</div>`;
    }
    $("#tabBody").innerHTML = `<h2 class="p-title">🛰 ${T().scanTitle}</h2><p class="p-sub">${T().scanHelp}</p>${box}`;
    const b = $("#seeScan"); if (b) b.onclick = () => selectSite(sc.id);
    bindReverse();
  }

  // ---------- live scan ----------
  async function fetchPower(lat, lon) {
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${POWER_PARAMS}&community=RE&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`;
    const raw = await (await fetch(url)).json();
    const p = raw.properties.parameter, fill = raw.header?.fill_value ?? -999;
    const ann = k => (p[k] && p[k].ANN !== fill ? p[k].ANN : null);
    const sw = MONTHS.map(m => p.ALLSKY_SFC_SW_DWN[m]).filter(v => v !== fill);
    return { t2m: ann("T2M"), t2m_range: ann("T2M_RANGE"), t2m_min: ann("T2M_MIN"), t2m_max: ann("T2M_MAX"), precip: ann("PRECTOTCORR"), rh: ann("RH2M"),
      ps: ann("PS"), sw: ann("ALLSKY_SFC_SW_DWN"), sw_min: Math.min(...sw), sw_max: Math.max(...sw), uv: ann("ALLSKY_SFC_UV_INDEX"), grid_elev: raw.geometry.coordinates[2] };
  }
  async function fetchReliefWindow(lat, lon) {
    // 5×5 grid over ±15 km plus the centre point (coarser than the offline 2 km grid, same P95–P5 metric)
    const pts = [[lat, lon]];
    const kx = 111.2 * Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) pts.push([lat + (i * 7.5) / 111.2, lon + (j * 7.5) / kx]);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[0].toFixed(4)).join(",")}&longitude=${pts.map(p => p[1].toFixed(4)).join(",")}`;
    const all = (await (await fetch(url)).json()).elevation;
    const e = all.slice(1).sort((a, b) => a - b);
    const q = f => e[Math.round(f * (e.length - 1))];
    return { center: all[0], relief_m: q(0.95) - q(0.05) };
  }
  async function scanPoint(lat, lng) {
    if (state.scanBusy) return;
    state.scanBusy = true; renderPanel();
    globe.ringsData([{ lat, lng }]);
    try {
      const [power, rel, ndvi] = await Promise.all([fetchPower(lat, lng), fetchReliefWindow(lat, lng), fetchNdvi(lat, lng)]);
      if (power.t2m == null) throw new Error("no data");
      const s = { id: "scan", name: state.lang === "es" ? "Punto escaneado" : "Scanned point", country: `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`, lat, lon: lng,
        scanned: true, usage: 0, access: null, power, elev: rel.center, relief_m: rel.relief_m, relief: TW.clamp(rel.relief_m / 1500) };
      KEYS.forEach(k => { if (!CLIMATE_KEYS.includes(k) && k !== "relief") s[k] = null; });
      if (ndvi != null) { s.ndvi = ndvi; s.barren = TW.clamp((0.5 - ndvi) / 0.4); }
      s.fp = TW.fingerprint(s);
      state.scan = s; state.selectedId = "scan";
    } catch (e) {
      state.scan = null;
    }
    state.scanBusy = false;
    renderPanel();
    if (state.stage === "earth") showEarthMode(false); else showEarthResults(rank(), false);
  }

  async function fetchNdvi(lat, lon) {
    // MODIS Terra MOD13Q1 NDVI (250 m) from the ORNL DAAC web service: January + July 2023 composites, 2 km window
    try {
      const vals = [];
      await Promise.all(["A2023017", "A2023193"].map(async d => {
        const js = await (await fetch(`https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&band=250m_16_days_NDVI&startDate=${d}&endDate=${d}&kmAboveBelow=1&kmLeftRight=1`, { headers: { Accept: "application/json" } })).json();
        js.subset.forEach(sub => sub.data.forEach(v => { if (v > -2000) vals.push(v * 0.0001); }));
      }));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    } catch { return null; }
  }

  // ---------- reverse twin: which Moon/Mars site does this Earth place resemble? ----------
  function reverseTwins(site) {
    const w = TW.profileWeights("balanced");
    return TARGETS.map(t => ({ t, ...TW.compare(site.fp, t, w) })).sort((a, b) => b.score - a.score);
  }
  function reverseHtml(site) {
    const list = reverseTwins(site).slice(0, 3);
    return `<div class="sec">🔄 ${T().reverse.title}</div><p class="help">${T().reverse.lead}</p>
      <ul class="twins">${list.map((r, i) => `<li><span class="orb ${r.t.body}"></span><span><b>${esc(short(r.t.name))}</b><small>${r.t.body === "Moon" ? T().moon : T().mars}</small>
        <span class="bar"><i style="width:${r.score}%;background:${i === 0 ? "var(--target)" : "var(--accent)"}"></i></span></span>
        <span class="v">${r.score.toFixed(0)}</span><button class="mini-btn" data-peek="${r.t.id}">🔭 ${T().reverse.see}</button></li>`).join("")}</ul>`;
  }
  function bindReverse() { document.querySelectorAll("[data-peek]").forEach(b => (b.onclick = () => peek(b.dataset.peek))); }

  function peek(id) {
    const t = TARGETS.find(x => x.id === id);
    state.peek = id;
    globe.arcsData([]);
    setTexture(t.body);
    globe.pointsData([{ lat: t.lat, lng: t.lon, alt: 0.02, r: 1.1, color: "#ff9b47", label: esc(t.name) }]);
    globe.htmlElementsData([{ lat: t.lat, lng: t.lon, alt: 0.03, el: labelEl(short(t.name), "win") }]);
    globe.ringsData([{ lat: t.lat, lng: t.lon }]);
    globe.pointOfView({ lat: Math.abs(t.lat) > 80 ? Math.sign(t.lat) * 70 : t.lat, lng: t.lon, altitude: 1.5 }, 1400);
    let bar = $("#peekBar");
    if (!bar) { bar = document.createElement("div"); bar.id = "peekBar"; bar.className = "peekbar"; document.body.appendChild(bar); }
    bar.innerHTML = `<span>🔭 ${T().reverse.viewing(esc(short(t.name)))}</span><button class="btn" id="unpeek">${T().reverse.backEarth}</button>`;
    bar.hidden = false;
    $("#unpeek").onclick = () => unpeek(true);
  }
  function unpeek(redraw) {
    state.peek = null;
    const bar = $("#peekBar"); if (bar) bar.hidden = true;
    if (!redraw) return;
    if (state.stage === "earth") showEarthMode(true);
    else if (state.tab === "map") drawHeatmap();
    else if (state.tab === "camp") renderVerdictPanel();
    else showEarthResults(rank(), true);
  }

  // ---------- "start from Earth" mode ----------
  function showEarthMode(focus) {
    setTexture("Earth");
    const sc = state.scan;
    globe.arcsData([]);
    globe.pointsData(CURATED.map(s => ({ lat: s.lat, lng: s.lon, alt: 0.02, r: 0.45, color: "#36c2b4", label: `<b>${esc(s.name)}</b>`,
      onClick: () => { state.scan = s; renderEarthPanel(); showEarthMode(true); } })));
    globe.htmlElementsData(sc ? [{ lat: sc.lat, lng: sc.lon, alt: 0.02, el: labelEl(sc.name.split(" – ")[0], "win") }] : []);
    globe.ringsData(sc ? [{ lat: sc.lat, lng: sc.lon }] : []);
    if (focus) globe.pointOfView(sc ? { lat: sc.lat, lng: sc.lon, altitude: 1.6 } : { lat: 0, lng: -70, altitude: 2.2 }, 1200);
  }
  function renderEarthPanel() {
    const sc = state.scan, E = T().earth;
    let body = `<p class="help">${E.pick}</p>`;
    if (state.scanBusy) body = `<div class="scanbox busy">${T().scanning}</div>`;
    else if (sc) {
      const best = reverseTwins(sc)[0];
      body = `<div class="scanbox"><b>📍 ${esc(sc.name)}</b><br><small class="help">${esc(sc.country)}${sc.elev != null ? ` · ${Math.round(sc.elev)} m` : ""}</small>
        ${reverseHtml(sc)}
        <div class="radar-wrap"><canvas id="radar"></canvas></div></div>`;
      setTimeout(() => { if ($("#radar")) drawRadar(sc, best.t); }, 0);
    }
    $("#panel").innerHTML = `<div class="p-body"><h2 class="p-title">🌍 ${E.title}</h2><p class="p-sub">${E.help}</p>${body}</div>
      <div class="p-foot"><button class="btn ghost" id="backBtn">${T().back}</button><button class="btn" id="toMission">${E.toMission}</button></div>`;
    $("#backBtn").onclick = goHome;
    $("#toMission").onclick = () => {
      const t = sc ? reverseTwins(sc)[0].t : TARGETS[0];
      if (state.peek) unpeek(false);
      state.scan = null; go("dest"); pickTarget(t.id);
    };
    bindReverse();
  }

  // ---------- global heat map (NASA POWER on a 3° land grid) ----------
  let gridCache = null;
  function gridCells() {
    if (gridCache) return gridCache;
    const G = window.TW_GRID;
    if (!G) return null;
    gridCache = G.rows.map(r => {
      const pw = {}; G.cols.forEach((c, i) => (pw[c] = r[i]));
      return { lat: pw.lat, lon: pw.lon, fp: TW.climateFromPower(pw, null), power: pw };
    });
    return gridCache;
  }
  function gridScores() {
    const cells = gridCells(); if (!cells) return null;
    const t = target(), w = weights(), wc = {};
    KEYS.forEach(k => (wc[k] = CLIMATE_KEYS.includes(k) ? w[k] : 0));
    return cells.map(c => ({ ...c, score: TW.compare(c.fp, t, wc).score }));
  }
  function distKm(a, b) {
    const r = Math.PI / 180, x = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lon - b.lon) * r);
    return 6371 * Math.acos(Math.min(1, Math.max(-1, x)));
  }
  function hotspots(scored, n = 5) {
    const out = [];
    for (const c of scored.slice().sort((a, b) => b.score - a.score)) {
      if (CURATED.some(s => distKm(c, s) < 700)) continue; // already catalogued nearby
      if (out.some(o => distKm(c, o) < 900)) continue;     // keep the list geographically diverse
      out.push(c);
      if (out.length >= n) break;
    }
    return out;
  }
  let heatScored = null, earthImg = null;
  function loadEarthImage() {
    if (earthImg) return Promise.resolve(earthImg);
    return new Promise(res => { const im = new Image(); im.onload = () => res((earthImg = im)); im.src = TEX.Earth; });
  }
  async function drawHeatmap() {
    // the heat map is painted INTO the globe texture (one image) instead of thousands of 3D objects
    const scored = gridScores(); if (!scored) return null;
    heatScored = scored;
    const lo = Math.min(...scored.map(c => c.score)), hi = Math.max(...scored.map(c => c.score));
    const W = 2048, H = 1024, step = window.TW_GRID.step || 2.5;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.drawImage(await loadEarthImage(), 0, 0, W, H);
    g.fillStyle = "rgba(3,6,13,0.45)"; g.fillRect(0, 0, W, H);
    const cw = (step / 360) * W, ch = (step / 180) * H;
    for (const c of scored) {
      const t = TW.clamp((c.score - lo) / (hi - lo || 1));
      g.globalAlpha = 0.35 + 0.55 * t;
      g.fillStyle = scoreColor(c.score, lo + (hi - lo) * 0.25, hi);
      g.fillRect(((c.lon + 180) / 360) * W - cw / 2, ((90 - c.lat) / 180) * H - ch / 2, cw + 0.5, ch + 0.5);
    }
    g.globalAlpha = 1;
    globe.globeImageUrl(cv.toDataURL("image/jpeg", 0.88)); currentTex = "heat";
    globe.pointsData(CURATED.map(s => ({ lat: s.lat, lng: s.lon, alt: 0.02, r: 0.3, color: "#ffffff", label: esc(s.name), onClick: () => selectSite(s.id) })));
    globe.ringsData([]).arcsData([]).htmlElementsData([]);
    return scored;
  }
  function heatClick(lat, lng) {
    // merged hexes are not individually clickable: scan the nearest grid cell instead
    if (!heatScored) return;
    const c = heatScored.reduce((b, x) => (distKm({ lat, lon: lng }, x) < distKm({ lat, lon: lng }, b) ? x : b));
    state.tab = "scan"; renderVerdictPanel(); setTexture("Earth"); scanPoint(c.lat, c.lon);
  }
  function tabMap() {
    const M = T().map;
    if (!window.TW_GRID) { $("#tabBody").innerHTML = `<p class="help">${M.missing}</p>`; return; }
    const scored = gridScores();
    drawHeatmap();
    const hs = hotspots(scored);
    $("#tabBody").innerHTML = `<h2 class="p-title">🔥 ${M.title}</h2><p class="p-sub">${M.lead(scored.length, window.TW_GRID.step)}</p>
      <div class="legend-bar"><span>${Math.round(Math.min(...scored.map(c => c.score)))}</span><i style="background:linear-gradient(90deg,${STOPS.join(",")})"></i><span>${Math.round(Math.max(...scored.map(c => c.score)))}</span></div>
      <p class="help">${M.climateOnly}</p>
      <div class="sec">💎 ${M.hotspots}</div>
      <ol class="rank" id="hotList">${hs.map((c, i) => `<li data-i="${i}"><div><b id="hs${i}">${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°</b><small>${c.power.t2m.toFixed(1)} °C · ${(c.power.precip * 365).toFixed(0)} mm/${state.lang === "es" ? "año" : "yr"} · ${c.power.ps.toFixed(0)} kPa</small></div><span class="v">${c.score.toFixed(0)}</span></li>`).join("")}</ol>`;
    document.querySelectorAll("#hotList li").forEach(li => (li.onclick = () => { const c = hs[+li.dataset.i]; globe.pointOfView({ lat: c.lat, lng: c.lon, altitude: 1.3 }, 1200); globe.ringsData([{ lat: c.lat, lng: c.lon }]); }));
    globe.pointOfView({ lat: hs[0]?.lat ?? 0, lng: hs[0]?.lon ?? 0, altitude: 2.4 }, 1400);
    hs.forEach((c, i) => placeName(c.lat, c.lon).then(n => { const el = $("#hs" + i); if (el && n) el.textContent = `${n} (${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°)`; }));
  }
  const placeCache = {};
  async function placeName(lat, lon) {
    const k = `${lat},${lon},${state.lang}`;
    if (k in placeCache) return placeCache[k];
    try {
      const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${state.lang}`)).json();
      return (placeCache[k] = [j.principalSubdivision, j.countryName].filter(Boolean).join(", ") || null);
    } catch { return null; }
  }

  // ---------- exports ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCSV(results) {
    const head = ["rank", "site", "country", "lat", "lon", "twin_score", "rank_value", "usage", ...KEYS];
    const rows = results.map((r, i) => [i + 1, r.site.name, r.site.country, r.site.lat, r.site.lon, r.score.toFixed(2), r.value.toFixed(2), r.site.usage ?? "", ...KEYS.map(k => r.site.fp[k] == null ? "" : r.site.fp[k].toFixed(3))]);
    download(`twinworlds_${state.targetId}_${state.profile}_${state.mode}.csv`, [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  }
  function exportCard(r) {
    const s = r.site, t = target();
    const md = `# TwinWorlds – ${s.name}
**${T().twinScore}:** ${r.score.toFixed(1)}/100 · ${short(t.name)} (${t.body}) · ${PL(state.profile)}
**${s.country}** · ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} · ${s.elev == null ? "" : Math.round(s.elev) + " m"}

| Axis | Earth | Earth data | Target | Target data | Match |
|---|---|---|---|---|---|
${KEYS.map(k => `| ${FL(k)} | ${s.fp[k] == null ? "?" : s.fp[k].toFixed(2)} | ${earthDetail(k, s)} | ${t[k].toFixed(2)} | ${targetDetail(k, t)} | ${r.per[k] == null ? "?" : Math.round(r.per[k] * 100) + "%"} |`).join("\n")}

${s.note || ""}

${T().beyond}

_TwinWorlds · NASA Space Apps 2026 · ${new Date().toISOString().slice(0, 10)}_
`;
    download(`twinworlds_${s.id}_${t.id}.md`, md, "text/markdown");
  }

  // ---------- deep links ----------
  function writeHash() { history.replaceState(null, "", `#t=${state.targetId}&p=${state.profile}&m=${state.mode}`); }
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const t = TARGETS.find(x => x.id === h.get("t"));
    if (!t || !PROFILES[h.get("p")]) return false;
    state.targetId = t.id; state.body = t.body; state.profile = h.get("p");
    if (["match", "untapped", "ready"].includes(h.get("m"))) state.mode = h.get("m");
    return true;
  }

  // ---------- boot ----------
  $("#startBtn").onclick = () => { go("dest"); ctl.autoRotate = false; showTargetsOnGlobe(); globe.pointOfView({ lat: -20, lng: 20, altitude: 2.4 }, 1200); };
  $("#homeBtn").onclick = goHome;
  $("#earthBtn").onclick = () => { state.scan = null; state.targetId = null; ctl.autoRotate = false; go("earth"); showEarthMode(true); };
  document.querySelectorAll("#lang button").forEach(b => (b.onclick = () => {
    state.lang = b.dataset.l; renderChrome(); renderPanel();
    if (state.stage === "verdict" && state.tab !== "camp") showEarthResults(rank(), false);
  }));

  renderChrome(); layoutGlobe();
  globe.pointOfView({ lat: 10, lng: -40, altitude: 2.3 }, 0);
  if (readHash()) {
    state.selectedId = rank()[0].site.id; ctl.autoRotate = false;
    go("verdict"); showEarthResults(rank(), true);
  }
  window.TWApp = { state, scanPoint, globe }; // handle for debugging / demos
})();
