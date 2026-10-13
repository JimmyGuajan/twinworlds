"""
TwinWorlds – planetary measurements
-----------------------------------
Derives target-site axes from REAL NASA planetary datasets (PDS Geosciences Node)
instead of hand-assigned values:

  relief  Moon: LRO LOLA LDEM_16 (16 px/deg)      Mars: MGS MOLA MEGDR megt90n000eb (16 px/deg)
          metric = P95 - P5 elevation inside a 15 km radius, sampled on a 2 km grid
          (the SAME metric is applied to Earth sites with the Copernicus GLO-90 DEM)
  ice     Moon: LRO Diviner Polar Resource Product (DLRE_PRP_SOUTH, 2.88 M mesh elements)
                -> fraction of area where water ice is thermally stable within 1 m of the surface
          Mars: Mars Odyssey Neutron Spectrometer epithermal map (Feldman et al. 2002)
                -> fewer epithermal neutrons = more hydrogen (water ice)
  cold    Moon polar: Diviner annual mean surface temperature in the same 15 km area
  light   seasonal insolation contrast computed from orbital elements (NASA Planetary Fact Sheet),
          same 1 - min/max monthly formula used for Earth with NASA POWER

Output: data/planetary_measurements.json  (merged into js/data.js by build_data.py)
Raw files are cached in data/raw/ (~70 MB; the 605 MB Diviner table is streamed, not stored).
"""
import json
import math
import ssl
import struct
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "planetary_measurements.json"
CTX = ssl.create_default_context()

SRC = {
    "lola": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img",
    "mola": "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img",
    "ns_epi": "https://pds-geosciences.wustl.edu/ody/urn-nasa-pds-odyssey_grs_special/data/ns_epithermal_020917.tab",
    "diviner": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab",
}
RADIUS_KM = {"Moon": 1737.4, "Mars": 3396.0, "Earth": 6371.0}
WINDOW_KM, STEP_KM = 15.0, 2.0


def download(key):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / Path(SRC[key]).name
    if not path.exists():
        print(f"downloading {SRC[key]}")
        with urllib.request.urlopen(SRC[key], timeout=600, context=CTX) as r, open(path, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    return path


# ---------- geometry ----------
def window_points(lat, lon, body, radius_km=WINDOW_KM, step_km=STEP_KM):
    """Points on a regular grid (local tangent plane) inside a circle, as lat/lon."""
    R = RADIUS_KM[body]
    n = int(radius_km // step_km)
    pts = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            dx, dy = j * step_km, i * step_km
            if dx * dx + dy * dy > radius_km * radius_km:
                continue
            # azimuthal-equidistant inverse: works right up to the poles
            d = math.hypot(dx, dy) / R
            az = math.atan2(dx, dy)
            p1, l1 = math.radians(lat), math.radians(lon)
            p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(az))
            l2 = l1 + math.atan2(math.sin(az) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
            pts.append((math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180))
    return pts


def relief_metric(elevs):
    e = np.asarray([v for v in elevs if v is not None], dtype=float)
    return float(np.percentile(e, 95) - np.percentile(e, 5)) if e.size else None


def sample_grid(grid, lat, lon, ppd=16):
    row = min(int((90 - lat) * ppd), grid.shape[0] - 1)
    col = int(((lon % 360) * ppd)) % grid.shape[1]
    return float(grid[row, col])


def load_dem(key):
    path = download(key)
    dtype = "<i2" if key == "lola" else ">i2"
    g = np.fromfile(path, dtype=dtype).reshape(2880, 5760).astype(float)
    return g * 0.5 if key == "lola" else g


# ---------- Mars hydrogen ----------
def load_ns_epithermal():
    rows = []
    for line in download("ns_epi").read_text().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3:
            try:
                rows.append(tuple(float(p) for p in parts[:3]))
            except ValueError:
                pass
    return np.array(rows)  # lon(0-360), lat, counts


def mars_ice(ns, lat, lon, radius_deg=3.0):
    valid = ns[ns[:, 2] > 0]
    lon360 = lon % 360
    dlon = np.abs(((valid[:, 0] - lon360) + 180) % 360 - 180) * np.cos(np.radians(lat))
    near = valid[(np.hypot(dlon, valid[:, 1] - lat) <= radius_deg)]
    v = float(near[:, 2].mean())
    med, low = np.percentile(valid[:, 2], 50), np.percentile(valid[:, 2], 2)
    return v, float(np.clip((med - v) / (med - low), 0, 1))


# ---------- Moon polar thermal / ice ----------
def diviner_stats(targets_south):
    """Stream the 605 MB Diviner PRP table once; keep only elements near our polar targets."""
    R = RADIUS_KM["Moon"]
    acc = {t["id"]: {"n": 0, "tavg": 0.0, "ice1m": 0, "trap": 0} for t in targets_south}
    print("streaming Diviner PRP (605 MB)…")
    with urllib.request.urlopen(SRC["diviner"], timeout=1800, context=CTX) as r:
        header = True
        for raw in r:
            if header:
                header = False
                continue
            p = raw.split(b",")
            try:
                clat = float(p[10])
            except (ValueError, IndexError):
                continue
            if clat > -84.5:
                continue
            clon, tavg, tmax, ice = float(p[9]), float(p[12]), float(p[13]), float(p[14])
            for t in targets_south:
                d = R * math.radians(math.hypot((clat - t["lat"]), ((clon - t["lon"] + 180) % 360 - 180) * math.cos(math.radians(clat))))
                # cheap prefilter, then exact great-circle distance
                if d > 60:
                    continue
                a = math.radians
                gc = R * math.acos(min(1, math.sin(a(clat)) * math.sin(a(t["lat"])) + math.cos(a(clat)) * math.cos(a(t["lat"])) * math.cos(a(clon - t["lon"]))))
                if gc <= WINDOW_KM:
                    s = acc[t["id"]]
                    s["n"] += 1
                    s["tavg"] += tavg
                    s["ice1m"] += 1 if 0 <= ice <= 1.0 else 0
                    s["trap"] += 1 if tmax < 110 else 0
    out = {}
    for k, s in acc.items():
        if s["n"]:
            out[k] = {"elements": s["n"], "t_avg_K": s["tavg"] / s["n"], "ice_within_1m_frac": s["ice1m"] / s["n"], "cold_trap_frac": s["trap"] / s["n"]}
    return out


# ---------- seasonal light from orbital mechanics ----------
ORBIT = {  # NASA Planetary Fact Sheet
    "Mars": {"obliquity": 25.19, "ecc": 0.0934, "ls_peri": 251.0},
    "Moon": {"obliquity": 1.54, "ecc": 0.0167, "ls_peri": 283.0},  # Moon follows Earth's heliocentric orbit
    "Earth": {"obliquity": 23.44, "ecc": 0.0167, "ls_peri": 283.0},
}


def seasonal_light(lat, body):
    o = ORBIT[body]
    eps, e = math.radians(o["obliquity"]), o["ecc"]
    phi = math.radians(lat)
    q = []
    for k in range(360):
        M = 2 * math.pi * (k + 0.5) / 360
        E = M
        for _ in range(8):
            E = E - (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        nu = 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
        ls = nu + math.radians(o["ls_peri"])
        r = (1 - e * e) / (1 + e * math.cos(nu))
        dec = math.asin(math.sin(eps) * math.sin(ls))
        x = -math.tan(phi) * math.tan(dec)
        h0 = math.pi if x <= -1 else 0.0 if x >= 1 else math.acos(x)
        q.append((h0 * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(h0)) / (r * r))
    months = [sum(q[i * 30:(i + 1) * 30]) / 30 for i in range(12)]
    ratio = min(months) / max(months) if max(months) > 0 else 0
    return ratio, float(np.clip((1 - ratio - 0.15) / 0.8, 0, 1))


def main():
    targets = json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))["targets"]
    dems = {"Moon": load_dem("lola"), "Mars": load_dem("mola")}
    ns = load_ns_epithermal()
    south = [t for t in targets if t["body"] == "Moon" and t["lat"] < -84]
    div = diviner_stats(south)

    res = {}
    for t in targets:
        body, m = t["body"], {}
        pts = window_points(t["lat"], t["lon"], body)
        rel = relief_metric([sample_grid(dems[body], la, lo) for la, lo in pts])
        m["relief_m"] = rel
        m["relief"] = float(np.clip(rel / 1500, 0, 1))
        ratio, light = seasonal_light(t["lat"], body)
        m["insolation_ratio"], m["light"] = ratio, light
        if body == "Mars":
            counts, ice = mars_ice(ns, t["lat"], t["lon"])
            m["ns_epithermal_counts"], m["ice"] = counts, ice
        elif t["id"] in div:
            d = div[t["id"]]
            m.update({f"diviner_{k}": v for k, v in d.items()})
            m["ice"] = float(np.clip(d["ice_within_1m_frac"] * 5, 0, 1))
            m["cold"] = float(np.clip((25 - (d["t_avg_K"] - 273.15)) / 75, 0, 1))
        res[t["id"]] = m
        print(t["id"], {k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items()})

    OUT.write_text(json.dumps({"sources": SRC, "window_km": WINDOW_KM, "step_km": STEP_KM, "targets": res}, indent=1), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
