/* TwinWorlds – Analog Similarity Engine
 * Every place (Earth site, Moon/Mars target, or a point you click) is turned
 * into a 15-dimension "environmental fingerprint" on 0..1 axes.
 * Climate axes for Earth come from NASA POWER; planetary targets are projected
 * onto the same axes (values beyond Earth's range saturate at 1).
 */
(function (global) {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  const FEATURES = [
    { key: "aridity",   label: "Aridity",                group: "climate", src: "NASA POWER · PRECTOTCORR, RH2M" },
    { key: "cold",      label: "Cold",                   group: "climate", src: "NASA POWER · T2M" },
    { key: "swing",     label: "Thermal swing",          group: "climate", src: "NASA POWER · T2M_RANGE" },
    { key: "thin_air",  label: "Thin atmosphere",        group: "climate", src: "NASA POWER · PS (elevation-corrected)" },
    { key: "radiation", label: "Solar / UV exposure",    group: "climate", src: "NASA POWER · ALLSKY_SFC_SW_DWN, UV_INDEX" },
    { key: "light",     label: "Light extremes",         group: "climate", src: "NASA POWER · monthly SW min/max" },
    { key: "basalt",    label: "Basaltic / volcanic",    group: "terrain", src: "Curated geology" },
    { key: "regolith",  label: "Loose regolith / fines", group: "terrain", src: "Curated geology" },
    { key: "ice",       label: "Ground ice / permafrost",group: "terrain", src: "Curated geology" },
    { key: "impact",    label: "Impact structure",       group: "terrain", src: "Curated geology" },
    { key: "caves",     label: "Caves / lava tubes",     group: "terrain", src: "Curated geology" },
    { key: "salts",     label: "Salts & evaporites",     group: "terrain", src: "Curated geology" },
    { key: "sediment",  label: "Lake / river sediments", group: "terrain", src: "Curated geology" },
    { key: "barren",    label: "No vegetation",          group: "terrain", src: "Curated geology" },
    { key: "relief",    label: "Rugged relief",          group: "terrain", src: "Curated geology" },
  ];
  const KEYS = FEATURES.map(f => f.key);
  const CLIMATE_KEYS = FEATURES.filter(f => f.group === "climate").map(f => f.key);

  // Mission profiles = weight vectors. What matters depends on what you test.
  const PROFILES = {
    balanced:  { label: "Balanced",                  icon: "⚖️", w: {} },
    habitat:   { label: "Habitat & construction",    icon: "🏗️", base: 0.5, w: { cold: 2, swing: 2, thin_air: 1, radiation: 1.5, regolith: 2, relief: 1.5, basalt: 1.5, ice: 1 } },
    isru:      { label: "ISRU · water ice",          icon: "🧊", base: 0.3, w: { ice: 3, cold: 2, regolith: 1.5, light: 1.5, aridity: 1 } },
    mobility:  { label: "Rover / EVA mobility",      icon: "🛞", base: 0.3, w: { regolith: 3, relief: 3, barren: 2, impact: 1.5, basalt: 1, swing: 1 } },
    astrobio:  { label: "Astrobiology & samples",    icon: "🧬", base: 0.3, w: { aridity: 3, radiation: 2, salts: 2.5, sediment: 2.5, ice: 1, barren: 1.5 } },
    caves:     { label: "Caves & radiation shelter", icon: "🕳️", base: 0.3, w: { caves: 3, basalt: 2.5, radiation: 1.5, swing: 1.5, barren: 1 } },
    power:     { label: "Polar light & power",       icon: "☀️", base: 0.3, w: { light: 3, cold: 2, relief: 2, ice: 1.5 } },
  };

  function profileWeights(id) {
    const p = PROFILES[id] || PROFILES.balanced;
    const base = p.base ?? 1;
    const w = {};
    KEYS.forEach(k => (w[k] = p.w[k] ?? base));
    return w;
  }

  /* Convert raw NASA POWER climatology into the 6 climate axes.
   * pointElev (m) lets us correct POWER's coarse-grid pressure to the true site
   * elevation with the barometric formula (scale height 8.4 km). */
  function climateFromPower(pw, pointElev) {
    if (!pw) return {};
    const out = {};
    if (pw.precip != null) {
      const P = Math.max(pw.precip * 365, 1); // mm/yr
      const pIdx = 1 - clamp((Math.log10(P) - Math.log10(25)) / (Math.log10(1500) - Math.log10(25)));
      const rhIdx = pw.rh != null ? 1 - clamp((pw.rh - 10) / 70) : pIdx;
      out.aridity = clamp(0.8 * pIdx + 0.2 * rhIdx);
    }
    if (pw.t2m != null) out.cold = clamp((25 - pw.t2m) / 75);
    if (pw.t2m_range != null) out.swing = clamp((pw.t2m_range - 4) / 18);
    if (pw.ps != null) {
      let ps = pw.ps;
      if (pointElev != null && pw.grid_elev != null) ps = ps * Math.exp(-(pointElev - pw.grid_elev) / 8400);
      out.thin_air = clamp((101.3 - ps) / (101.3 - 50));
      out._ps = ps;
    }
    if (pw.sw != null) {
      const sw = clamp((pw.sw - 2.5) / 5);
      const uv = pw.uv != null ? clamp(pw.uv / 4) : sw;
      // thin air lets more UV through: add an altitude bonus
      out.radiation = clamp(0.45 * sw + 0.4 * uv + 0.15 * (out.thin_air ?? 0));
    }
    if (pw.sw_min != null && pw.sw_max) {
      out.light = clamp((1 - pw.sw_min / pw.sw_max - 0.15) / 0.8);
    }
    return out;
  }

  function fingerprint(site) {
    const fp = {};
    const clim = climateFromPower(site.power, site.elev ?? null);
    KEYS.forEach(k => {
      if (CLIMATE_KEYS.includes(k)) fp[k] = clim[k] ?? site[k] ?? null;
      else fp[k] = site[k] ?? null;
    });
    return fp;
  }

  /* Weighted similarity. Missing axes are skipped and lower the confidence. */
  function compare(fpEarth, fpTarget, weights) {
    let num = 0, den = 0, all = 0;
    const per = {};
    KEYS.forEach(k => {
      const w = weights[k] ?? 1;
      all += w;
      const e = fpEarth[k], t = fpTarget[k];
      if (e == null || t == null || w === 0) { per[k] = null; return; }
      const d = Math.abs(e - t);
      per[k] = 1 - d;
      num += w * d * d;
      den += w;
    });
    const score = den ? 100 * (1 - Math.sqrt(num / den)) : 0;
    return { score, per, confidence: all ? den / all : 0 };
  }

  /* Analog Campaign Builder: no single place on Earth is the Moon.
   * Greedily pick k sites that together cover the target best
   * (coverage = weighted mean over axes of the BEST site for that axis). */
  function buildCampaign(candidates, target, weights, k = 3) {
    const chosen = [];
    const best = {};
    KEYS.forEach(k2 => (best[k2] = 0));
    const total = KEYS.reduce((a, k2) => a + (weights[k2] ?? 1), 0) || 1;
    const coverageWith = c => KEYS.reduce((a, k2) => a + (weights[k2] ?? 1) * Math.max(best[k2], c.per[k2] ?? 0), 0) / total;
    for (let i = 0; i < k; i++) {
      let pick = null, pickCov = -1;
      candidates.forEach(c => {
        if (chosen.includes(c)) return;
        const cov = coverageWith(c);
        if (cov > pickCov) { pickCov = cov; pick = c; }
      });
      if (!pick) break;
      chosen.push(pick);
      KEYS.forEach(k2 => (best[k2] = Math.max(best[k2], pick.per[k2] ?? 0)));
    }
    const owner = {};
    KEYS.forEach(k2 => {
      let o = null, v = -1;
      chosen.forEach(c => { if ((c.per[k2] ?? 0) > v) { v = c.per[k2] ?? 0; o = c; } });
      owner[k2] = { site: o, value: v }; // site = the chosen ranking entry ({site, per, score})
    });
    return { chosen, coverage: 100 * KEYS.reduce((a, k2) => a + (weights[k2] ?? 1) * best[k2], 0) / total, owner };
  }

  global.TW = { FEATURES, KEYS, CLIMATE_KEYS, PROFILES, profileWeights, climateFromPower, fingerprint, compare, buildCampaign, clamp };
})(window);
