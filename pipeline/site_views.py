"""
TwinWorlds – same-scale site views
----------------------------------
Builds a 40 km x 40 km image centred on every Earth site and every Moon/Mars target,
all in the SAME local projection (azimuthal equidistant) and the SAME scale, so the app
can show "Earth vs Moon/Mars" side by side with one scale bar.

  Earth : NASA GIBS WMS – Landsat WELD true colour (30 m). Antarctic sites (no Landsat in WELD)
          fall back to MODIS Terra true colour (250 m).
  Moon  : NASA Moon Trek – LRO WAC global mosaic (~100 m/px, WMTS zoom 8; zoom 7 at the pole)
  Mars  : NASA Mars Trek – Viking MDIM 2.1 colour mosaic (232 m/px, WMTS zoom 7)

Trek tiles are equirectangular (EPSG:4326), which explodes near the poles; we therefore
resample them pixel by pixel into the local projection, which also handles the lunar south pole.

Output: assets/views/earth/<id>.jpg, assets/views/target/<id>.jpg, data/views.json (sources)
"""
import io
import json
import math
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from planetary import RADIUS_KM  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "views"
TILE_CACHE = ROOT / "data" / "raw" / "trek_tiles"
CTX = ssl.create_default_context()
WINDOW_KM, PX = 40.0, 512

GIBS = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1"
        "&LAYERS={layer}&STYLES=&SRS=EPSG:4326&BBOX={bbox}&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg{time}")
TREK = {
    "Moon": ("https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg", 8, "LRO WAC global mosaic (NASA Moon Trek)"),
    "Mars": ("https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg", 7, "Viking MDIM 2.1 colour mosaic (NASA Mars Trek)"),
}


def fetch(url):
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TwinWorlds/1.0 (NASA Space Apps 2026)"})
            with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                return r.read()
        except Exception as e:
            err = e
    raise RuntimeError(f"{url}: {err}")


def local_grid(lat, lon, body, n=PX, window=WINDOW_KM):
    """lat/lon of every output pixel of an azimuthal-equidistant window centred on (lat, lon)."""
    R = RADIUS_KM[body]
    xs = (np.arange(n) + 0.5) / n * window - window / 2
    X, Y = np.meshgrid(xs, -xs)  # north up
    d = np.hypot(X, Y) / R
    az = np.arctan2(X, Y)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = np.arcsin(np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(az))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(d) * math.cos(p1), np.cos(d) - math.sin(p1) * np.sin(p2))
    return np.degrees(p2), (np.degrees(l2) + 540) % 360 - 180


def earth_view(site):
    """GIBS WMS returns a lat/lon box; we resample it into the same local projection as the planets."""
    lat, lon = site["lat"], site["lon"]
    LAT, LON = local_grid(lat, lon, "Earth")
    pad = 0.02
    a0, a1, o0, o1 = LAT.min() - pad, LAT.max() + pad, LON.min() - pad, LON.max() + pad
    w = 1024
    h = max(64, int(w * (a1 - a0) / (o1 - o0)))
    antarctic = lat < -60
    layer = "MODIS_Terra_CorrectedReflectance_TrueColor" if antarctic else "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual"
    time = "&TIME=2023-12-20" if antarctic else ""
    img = np.asarray(Image.open(io.BytesIO(fetch(GIBS.format(layer=layer, bbox=f"{o0},{a0},{o1},{a1}", w=w, h=h, time=time)))).convert("RGB"))
    rows = np.clip(((a1 - LAT) / (a1 - a0) * h).astype(int), 0, h - 1)
    cols = np.clip(((LON - o0) / (o1 - o0) * w).astype(int), 0, w - 1)
    src = "NASA GIBS · MODIS Terra true colour (250 m)" if antarctic else "NASA GIBS · Landsat WELD true colour (30 m)"
    return Image.fromarray(img[rows, cols]), src


def trek_view(target):
    body = target["body"]
    url, z, src = TREK[body]
    if body == "Moon" and abs(target["lat"]) > 88:
        z = 7  # every longitude is inside the window at the pole: one zoom level less keeps it to ~500 tiles
    LAT, LON = local_grid(target["lat"], target["lon"], body)
    ntx, nty = 2 ** (z + 1), 2 ** z
    deg = 180 / nty  # degrees per tile
    fx = (LON + 180) / deg
    fy = (90 - LAT) / deg
    tx, ty = np.clip(fx.astype(int), 0, ntx - 1), np.clip(fy.astype(int), 0, nty - 1)
    px = np.clip(((fx - tx) * 256).astype(int), 0, 255)
    py = np.clip(((fy - ty) * 256).astype(int), 0, 255)
    needed = sorted(set(zip(ty.ravel().tolist(), tx.ravel().tolist())))
    print(f"   {target['id']}: {len(needed)} Trek tiles at zoom {z}")
    cache = TILE_CACHE / body / str(z)
    cache.mkdir(parents=True, exist_ok=True)

    def load(t):
        y, x = t
        f = cache / f"{y}_{x}.jpg"
        if not f.exists():
            f.write_bytes(fetch(url.format(z=z, y=y, x=x)))
        return t, np.asarray(Image.open(f).convert("RGB"))

    with ThreadPoolExecutor(6) as ex:
        tiles = dict(ex.map(load, needed))
    out = np.zeros((PX, PX, 3), dtype=np.uint8)
    for (y, x), arr in tiles.items():
        m = (ty == y) & (tx == x)
        out[m] = arr[py[m], px[m]]
    return Image.fromarray(out), src


def main():
    sites = json.loads((ROOT / "data" / "earth_sites.json").read_text(encoding="utf-8"))["sites"]
    targets = json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))["targets"]
    (OUT / "earth").mkdir(parents=True, exist_ok=True)
    (OUT / "target").mkdir(parents=True, exist_ok=True)
    meta = {"window_km": WINDOW_KM, "earth": {}, "target": {}}
    only = set(sys.argv[1:])
    for t in targets:
        if only and t["id"] not in only:
            continue
        img, src = trek_view(t)
        img.save(OUT / "target" / f"{t['id']}.jpg", quality=85)
        meta["target"][t["id"]] = src
    for s in sites:
        if only and s["id"] not in only:
            continue
        img, src = earth_view(s)
        img.save(OUT / "earth" / f"{s['id']}.jpg", quality=85)
        meta["earth"][s["id"]] = src
        print("  ", s["id"], src)
    old = json.loads((ROOT / "data" / "views.json").read_text()) if (ROOT / "data" / "views.json").exists() else {"earth": {}, "target": {}}
    old["earth"].update(meta["earth"]); old["target"].update(meta["target"]); old["window_km"] = WINDOW_KM
    (ROOT / "data" / "views.json").write_text(json.dumps(old, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
