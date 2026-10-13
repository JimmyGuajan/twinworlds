"""
TwinWorlds data pipeline
------------------------
1. Reads the curated Earth analog catalog (data/earth_sites.json) and the
   planetary targets (data/targets.json).
2. Downloads the 2001-2025 climatology for every Earth site from the
   NASA POWER API (https://power.larc.nasa.gov), parameters:
     T2M, T2M_RANGE, T2M_MIN, PRECTOTCORR, RH2M, PS,
     ALLSKY_SFC_SW_DWN (monthly, for the polar-light index), ALLSKY_SFC_UV_INDEX
3. Writes js/data.js  ->  window.TW_DATA = {sites, targets, generated, source}
   so the web app works offline / from file:// with no server.
   Point elevations come from the Copernicus GLO-90 DEM (Open-Meteo elevation API).

Usage:  python pipeline/build_data.py            (uses data/power_cache.json)
        python pipeline/build_data.py --refresh  (re-downloads everything)
"""
import json
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "power_cache.json"
OUT = ROOT / "js" / "data.js"

PARAMS = "T2M,T2M_RANGE,T2M_MIN,T2M_MAX,PRECTOTCORR,RH2M,PS,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX"
URL = ("https://power.larc.nasa.gov/api/temporal/climatology/point"
       "?parameters={p}&community=RE&longitude={lon}&latitude={lat}&format=JSON")
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def fetch(lat, lon):
    ctx = ssl.create_default_context()
    url = URL.format(p=PARAMS, lat=lat, lon=lon)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90, context=ctx) as r:
                return json.load(r)
        except Exception as e:  # network hiccups / rate limit
            print(f"   retry {attempt + 1}: {e}")
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"POWER request failed for {lat},{lon}")


def summarize(raw):
    """Reduce a POWER climatology response to the raw values the app needs."""
    p = raw["properties"]["parameter"]
    fill = raw.get("header", {}).get("fill_value", -999.0)

    def ann(k):
        v = p[k]["ANN"]
        return None if v == fill else v

    sw = [p["ALLSKY_SFC_SW_DWN"][m] for m in MONTHS]
    sw = [v for v in sw if v != fill]
    return {
        "t2m": ann("T2M"),
        "t2m_range": ann("T2M_RANGE"),
        "t2m_min": ann("T2M_MIN"),
        "t2m_max": ann("T2M_MAX"),
        "precip": ann("PRECTOTCORR"),
        "rh": ann("RH2M"),
        "ps": ann("PS"),
        "sw": ann("ALLSKY_SFC_SW_DWN"),
        "sw_min": min(sw) if sw else None,
        "sw_max": max(sw) if sw else None,
        "uv": ann("ALLSKY_SFC_UV_INDEX"),
        "grid_elev": raw["geometry"]["coordinates"][2],
    }


def fetch_elevations(sites):
    """True point elevation (Copernicus DEM 90 m via Open-Meteo) to correct POWER's grid pressure."""
    lats = ",".join(str(s["lat"]) for s in sites)
    lons = ",".join(str(s["lon"]) for s in sites)
    url = f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}"
    with urllib.request.urlopen(url, timeout=60, context=ssl.create_default_context()) as r:
        return json.load(r)["elevation"]


def earth_relief(sites):
    """Relief with the SAME metric used for Moon/Mars (P95-P5 elevation, 15 km radius, 2 km grid),
    sampled from the Copernicus GLO-90 DEM. Cached in data/relief_cache.json."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from planetary import window_points, relief_metric
    cache_path = DATA / "relief_cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    for s in sites:
        key = f"{s['lat']},{s['lon']}"
        if key in cache:
            continue
        pts = window_points(s["lat"], s["lon"], "Earth")
        elev = []
        for i in range(0, len(pts), 50):
            chunk = pts[i:i + 50]
            url = ("https://api.open-meteo.com/v1/elevation?latitude=" + ",".join(f"{a:.4f}" for a, _ in chunk)
                   + "&longitude=" + ",".join(f"{b:.4f}" for _, b in chunk))
            for attempt in range(6):
                try:
                    with urllib.request.urlopen(url, timeout=60, context=ssl.create_default_context()) as r:
                        elev += json.load(r)["elevation"]
                    break
                except Exception as e:  # Open-Meteo throttles bursts with 503/429
                    print(f"   retry {attempt + 1}: {e}")
                    time.sleep(5 * (attempt + 1))
            time.sleep(1.0)
        cache[key] = relief_metric(elev)
        print(f"   relief {s['name']}: {cache[key]:.0f} m")
        cache_path.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    for s in sites:
        s["relief_curated"] = s.get("relief")
        s["relief_m"] = cache[f"{s['lat']},{s['lon']}"]
        s["relief"] = round(min(max(s["relief_m"] / 1500, 0), 1), 3)


# Physical values measured by missions for axes that saturate at Earth's extreme.
MISSION_FACTS = {
    "Moon": {"cold": "Diviner: equatorial mean ~215 K; polar cold traps < 40 K", "thin_air": "Surface exosphere ~3e-15 bar (LADEE)",
             "aridity": "No liquid water; ice only in cold traps (LCROSS, LAMP)", "radiation": "No atmosphere/magnetosphere: full solar UV + GCR (CRaTER)",
             "swing": "Diviner: −170 °C to +120 °C day/night"},
    "Mars": {"cold": "Mean ~ −60 °C (REMS / MEDA)", "thin_air": "0.6–0.9 kPa CO₂ (REMS / MEDA)", "aridity": "Atmospheric water ~10 pr-µm (TES/CRISM)",
             "radiation": "~0.67 mSv/day at surface (MSL RAD)", "swing": "Diurnal ΔT up to 90 K (REMS)"},
}
AXIS_SOURCE = {"relief": "relief_m", "ice": "ice", "light": "light", "cold": "cold"}


def merge_planetary(targets):
    path = DATA / "planetary_measurements.json"
    if not path.exists():
        print("   (no planetary_measurements.json – run pipeline/planetary.py)")
        return
    meas = json.loads(path.read_text(encoding="utf-8"))["targets"]
    for t in targets:
        m = meas.get(t["id"], {})
        prov = {}
        for k, txt in MISSION_FACTS[t["body"]].items():
            prov[k] = {"kind": "mission", "text": txt}
        if "relief" in m:
            t["relief"] = round(m["relief"], 3)
            ds = "LRO LOLA LDEM_16" if t["body"] == "Moon" else "MGS MOLA MEGDR"
            prov["relief"] = {"kind": "measured", "text": f"{ds}: {m['relief_m']:.0f} m relief within 15 km"}
        if "light" in m:
            t["light"] = round(m["light"], 3)
            prov["light"] = {"kind": "measured", "text": f"Orbital insolation model: darkest/brightest month = {m['insolation_ratio']:.2f}"}
        if "ice" in m:
            t["ice"] = round(m["ice"], 3)
            if t["body"] == "Mars":
                prov["ice"] = {"kind": "measured", "text": f"Mars Odyssey NS epithermal neutrons: {m['ns_epithermal_counts']:.2f} counts/s (lower = more H₂O, sees top ~1 m)"}
                radar = t.get("radar_ice")
                if radar and radar["value"] > t["ice"]:  # neutrons miss ice buried below ~1 m; radar sees it
                    t["ice"] = radar["value"]
                    prov["ice"]["text"] += f" · {radar['text']}"
            else:
                prov["ice"] = {"kind": "measured", "text": f"LRO Diviner PRP: ice stable ≤1 m in {100 * m['diviner_ice_within_1m_frac']:.0f}% of area, cold traps {100 * m['diviner_cold_trap_frac']:.0f}%"}
        if "cold" in m:
            t["cold"] = round(m["cold"], 3)
            prov["cold"] = {"kind": "measured", "text": f"LRO Diviner PRP: mean surface T {m['diviner_t_avg_K']:.0f} K"}
        t["prov"] = prov


def main():
    refresh = "--refresh" in sys.argv
    sites = json.loads((DATA / "earth_sites.json").read_text(encoding="utf-8"))["sites"]
    targets = json.loads((DATA / "targets.json").read_text(encoding="utf-8"))["targets"]
    cache = {} if refresh or not CACHE.exists() else json.loads(CACHE.read_text(encoding="utf-8"))

    for i, s in enumerate(sites, 1):
        key = f"{s['lat']},{s['lon']}"
        if key not in cache:
            print(f"[{i}/{len(sites)}] NASA POWER -> {s['name']}")
            cache[key] = summarize(fetch(s["lat"], s["lon"]))
            CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
            time.sleep(0.5)
        s["power"] = cache[key]

    for s, e in zip(sites, fetch_elevations(sites)):
        s["elev"] = e
    earth_relief(sites)
    merge_planetary(targets)

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "NASA POWER Climatology API v2 (2001-2025), community=RE",
        "sites": sites,
        "targets": targets,
    }
    OUT.write_text("// AUTO-GENERATED by pipeline/build_data.py - do not edit by hand\n"
                   "window.TW_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    print(f"Wrote {OUT} with {len(sites)} Earth sites and {len(targets)} targets")


if __name__ == "__main__":
    main()
