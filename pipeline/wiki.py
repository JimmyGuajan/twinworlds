"""
TwinWorlds – "Get to know the place"
------------------------------------
For every Earth site: the Wikipedia summary (Spanish + English) and a photo from
Wikimedia Commons WITH its author and licence, so the app can credit it properly.

  1. en.wikipedia REST summary of the curated article title (WIKI below)
  2. Spanish article via langlinks (falls back to English text)
  3. Lead image -> Commons imageinfo: 800 px thumbnail, author, licence, file page
     PHOTO overrides the lead image where it is a map/diagram or missing.

Output: js/wiki.js -> window.TW_WIKI = {<site id>: {es, en, photo}}
"""
import html
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "wiki.js"
CTX = ssl.create_default_context()
UA = {"User-Agent": "TwinWorlds/1.0 (NASA Space Apps 2026 student project; https://github.com/JimmyGuajan/twinworlds)"}

WIKI = {
    "atacama_yungay": "Atacama Desert", "haughton": "Haughton impact crater", "death_valley": "Death Valley",
    "mcmurdo_dry_valleys": "McMurdo Dry Valleys", "mauna_kea": "Mauna Kea", "kau_desert": "Kaʻū Desert",
    "svalbard_bockfjorden": "Sverrefjellet", "rio_tinto": "Río Tinto (river)", "lanzarote": "Timanfaya National Park",
    "holuhraun": "Holuhraun", "mdrs_utah": "Mars Desert Research Station", "craters_of_the_moon": "Craters of the Moon National Monument and Preserve",
    "meteor_crater": "Meteor Crater", "lonar": "Lonar Lake", "qaidam": "Qaidam Basin", "pilbara": "Pilbara Craton",
    "pisgah": "Pisgah Crater", "axel_heiberg": "Axel Heiberg Island", "ries": "Nördlinger Ries", "dhofar": "Dhofar Governorate",
    "ramon": "Makhtesh Ramon", "dome_c": "Concordia Station", "dallol": "Dallol (hydrothermal system)", "lut": "Dasht-e Lut",
    "uyuni": "Salar de Uyuni", "piedra_pomez": "Campo de Piedra Pómez", "pajonales": "Salar de Pajonales", "licancabur": "Licancabur",
    "chimborazo_arenal": "Chimborazo", "cotopaxi_ash": "Cotopaxi", "sierra_negra": "Sierra Negra (Galápagos)", "fernandina": "Fernandina Island",
    "tolbachik": "Tolbachik", "namib": "Namib Sand Sea", "gilf_kebir": "Gilf Kebir", "changtang": "Changtang", "miller_range": "Miller Range",
    "tenoumer": "Tenoumer crater", "aorounga": "Aorounga crater", "wolfe_creek": "Wolfe Creek crater", "payun_matru": "Payún Matrú",
    "harrat_khaybar": "Harrat Khaybar", "undara": "Undara Volcanic National Park", "emi_koussi": "Emi Koussi", "rub_al_khali": "Rub' al Khali",
}
# Hand-picked Commons photos where the article's lead image is a map, a diagram or unrelated ("" = no photo)
PHOTO = {
    "atacama_yungay": "File:Paisaje en el desierto de Atacama, Chile, 2016-02-06, DD 16.JPG",
    "haughton": "File:Rovers Red and Black at Houghton Crater Devon Island Canada.jpg",
    "mcmurdo_dry_valleys": "File:Labyrinth, Wright Valley, McMurdo Dry Valleys, Antarctica.jpg",
    "piedra_pomez": "File:Campo de piedra pomez en catamarca.jpg",
    "qaidam": "File:Yardangs in the Tsaidam Desert.jpg",
    "pilbara": "File:Hamersley Range, Pilbara Region, Western Australia.JPG",
    "dhofar": "",
    "axel_heiberg": "",
}


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60, context=CTX) as r:
                return json.load(r)
        except Exception as e:
            if getattr(e, "code", None) == 404:
                return None
            time.sleep(2 * (attempt + 1))
    return None


def summary(lang, title):
    js = get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title.replace(' ', '_'), safe='')}")
    if not js or js.get("type") == "disambiguation":
        return None
    return {"title": js["title"], "extract": js.get("extract", ""), "url": js["content_urls"]["desktop"]["page"],
            "image": (js.get("originalimage") or {}).get("source")}


def es_title(en_title):
    js = get("https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=es&format=json&titles=" + urllib.parse.quote(en_title))
    for p in (js or {}).get("query", {}).get("pages", {}).values():
        for ll in p.get("langlinks", []):
            return ll["*"]
    return None


def strip_html(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def commons(file_title):
    js = get("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&titles="
             + urllib.parse.quote(file_title))
    for p in (js or {}).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            return None
        md = ii.get("extmetadata", {})
        return {"src": ii.get("thumburl") or ii["url"], "page": ii["descriptionurl"],
                "author": strip_html(md.get("Artist", {}).get("value"))[:120] or "Unknown",
                "license": strip_html(md.get("LicenseShortName", {}).get("value")) or "see file page"}
    return None


BAD = re.compile(r"map|svg|relief|locator|location|flag|logo|icon|diagram|\.png$|\.gif$", re.I)


def article_photo(title):
    """First real photograph used in the article (skips maps, diagrams, flags, icons)."""
    js = get("https://en.wikipedia.org/w/api.php?action=query&prop=images&imlimit=60&format=json&titles=" + urllib.parse.quote(title))
    for p in (js or {}).get("query", {}).get("pages", {}).values():
        for im in p.get("images", []):
            t = im["title"]
            if re.search(r"\.jpe?g$", t, re.I) and not BAD.search(t):
                return t
    return None


def main():
    out = {}
    for sid, title in WIKI.items():
        en = summary("en", title)
        if not en:
            print(f"!! {sid}: no English article '{title}'")
            continue
        t_es = es_title(en["title"])
        es = summary("es", t_es) if t_es else None
        photo = None
        file_title = PHOTO.get(sid)
        if file_title == "":
            en["image"] = None  # explicitly no photo
        if not file_title and en["image"]:
            name = urllib.parse.unquote(en["image"].split("?")[0].rsplit("/", 1)[-1])
            file_title = "File:" + re.sub(r"^\d+px-", "", name)  # thumbnail URL -> original file name
        if PHOTO.get(sid) != "" and (not file_title or BAD.search(file_title)):
            file_title = article_photo(en["title"]) or file_title
        if file_title:
            photo = commons(file_title)
            if photo:
                photo["file"] = file_title
        out[sid] = {"en": {k: en[k] for k in ("title", "extract", "url")},
                    "es": {k: es[k] for k in ("title", "extract", "url")} if es else None, "photo": photo}
        print(f"{sid:22} es={'yes' if es else 'no ':3} photo={file_title}")
        time.sleep(1.0)
    OUT.write_text("// AUTO-GENERATED by pipeline/wiki.py – Wikipedia summaries (CC BY-SA) and Wikimedia Commons photos (credited)\n"
                   "window.TW_WIKI = " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("wrote", OUT, len(out))


if __name__ == "__main__":
    main()
