"""Builds the 3D-globe textures from NASA imagery (public domain):
Earth = NASA GIBS Blue Marble (WMS), Moon = LRO WAC mosaic, Mars = Viking MDIM 2.1 (NASA Trek WMTS tiles)."""
import io
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
CTX = ssl.create_default_context()
GIBS = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0"
        "&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg")
TREK = {
    "moon": "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
    "mars": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
}


def get(url):
    with urllib.request.urlopen(url, timeout=120, context=CTX) as r:
        return r.read()


def main(z=3):
    ASSETS.mkdir(exist_ok=True)
    Image.open(io.BytesIO(get(GIBS))).convert("RGB").save(ASSETS / "earth.jpg", quality=88)
    nx, ny = 2 ** (z + 1), 2 ** z  # EPSG:4326 tile matrix: 2x1 tiles at level 0
    for name, url in TREK.items():
        canvas = Image.new("RGB", (nx * 256, ny * 256))
        for y in range(ny):
            for x in range(nx):
                tile = Image.open(io.BytesIO(get(url.format(z=z, y=y, x=x)))).convert("RGB")
                canvas.paste(tile, (x * 256, y * 256))
        canvas.save(ASSETS / f"{name}.jpg", quality=88)
        print("wrote", name, canvas.size)


if __name__ == "__main__":
    main()
