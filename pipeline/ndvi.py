"""
TwinWorlds – vegetation from MODIS
----------------------------------
Replaces the literature estimate of the "barren" axis with a MEASURED value:
MODIS Terra MOD13Q1 NDVI (250 m, 16-day composites) from the NASA-funded
ORNL DAAC MODIS Web Service. For every Earth site we average a 4 km x 4 km
window over four 2023 composites (one per season).

  barren = clamp((0.5 - NDVI) / 0.4)   ->  NDVI <= 0.1 (bare rock/sand/ice) = 1, NDVI >= 0.5 (forest/crops) = 0

Output: data/ndvi_cache.json  (merged into js/data.js by build_data.py)
"""
import json
import ssl
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "ndvi_cache.json"
URL = ("https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude={lat}&longitude={lon}"
       "&band=250m_16_days_NDVI&startDate={d}&endDate={d}&kmAboveBelow=2&kmLeftRight=2")
DATES = ["A2023017", "A2023113", "A2023193", "A2023289"]  # Jan, Apr, Jul, Oct composites
CTX = ssl.create_default_context()


def ndvi_mean(lat, lon):
    vals = []
    for d in DATES:
        for attempt in range(4):
            try:
                req = urllib.request.Request(URL.format(lat=lat, lon=lon, d=d), headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                    js = json.load(r)
                scale = float(js.get("scale", 0.0001))
                for sub in js["subset"]:
                    vals += [v * scale for v in sub["data"] if v > -2000]  # -3000 = fill
                break
            except Exception as e:
                print(f"   retry {attempt + 1}: {e}")
                time.sleep(4 * (attempt + 1))
    return sum(vals) / len(vals) if vals else None


def barren_from_ndvi(ndvi):
    return None if ndvi is None else round(min(max((0.5 - ndvi) / 0.4, 0), 1), 3)


def main():
    sites = json.loads((ROOT / "data" / "earth_sites.json").read_text(encoding="utf-8"))["sites"]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    for i, s in enumerate(sites, 1):
        key = f"{s['lat']},{s['lon']}"
        if key in cache:
            continue
        cache[key] = ndvi_mean(s["lat"], s["lon"])
        print(f"[{i}/{len(sites)}] {s['name']}: NDVI {cache[key]}")
        CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    print("wrote", CACHE)


if __name__ == "__main__":
    main()
