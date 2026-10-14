# TwinWorlds 🌍🌕🔴
**Find Earth's twin for every Moon & Mars base site.**

**▶ Live demo: https://jimmyguajan.github.io/twinworlds/**
NASA Space Apps Challenge 2026: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*

TwinWorlds turns every place (an Earth site, a Moon or Mars landing site, or **any point you click**) into a 15-axis **environmental fingerprint** measured from open NASA data. It then tells you, with evidence, **where on Earth to rehearse your mission**.

## The experience
1. **Destination.** Pick a base or landing site on a 3D Moon or Mars, textured with LRO WAC and Viking MDIM 2.1 imagery from NASA Trek.
2. **Mission.** Choose what to test: ISRU and water ice, rover and EVA mobility, caves and radiation shelter, astrobiology, polar light and power, or habitat construction.
3. **🚀 Launch.** A "mission computer" types out the real analysis (LOLA relief, Diviner ice, NASA POWER climate…). Meanwhile a ship leaves the target world, flies to Earth and lands on the best twin, and towers on the globe show every site's score.
4. **Verdict.** *"Based on this data analysis, the best place on Earth to rehearse … is …"*, with the reasons, what the site **cannot** simulate, and a radar comparison.
5. **Explore.** Five tabs:
   - **Top 10**: best match, *untapped* (new analogs) or *field-ready*.
   - **Campaign**: 3 complementary sites linked by arcs on the globe.
   - **Evidence**: the source of every number.
   - **Scan**: click any point on the planet to fingerprint it live.

The interface is available in Spanish and English.

## What makes it different
| Idea | What it does |
|---|---|
| **Same yardstick on three worlds** | Relief is measured identically (P95–P5 elevation within 15 km on a 2 km grid): LRO LOLA on the Moon, MGS MOLA on Mars, and the Copernicus DEM on Earth. |
| **Measured planetary profiles** | **Lunar ice and cold:** 2.88 M elements of the LRO Diviner Polar Resource Product, streamed from PDS. **Martian ice:** the Mars Odyssey neutron map plus SHARAD radar for buried glaciers. **Seasonal light:** an orbital insolation model. |
| **Earth climate from NASA POWER** | 25-year climatology (2001–2025) for aridity, cold, thermal swing, pressure (corrected to the true elevation), solar and UV exposure, and seasonal light. |
| **Provenance on every number** | Each axis carries a *measured*, *mission* or *literature* badge, so judges and scientists can see exactly what is data and what is an estimate. |
| **Mission-aware scoring** | Weights depend on what you are testing. |
| **Untapped analog finder** | Opportunity = similarity × (1 − current analog usage). It surfaces places nobody has used yet. |
| **Analog Campaign Builder** | A greedy set-cover picks 3 complementary sites that cover 90–96% of the target, against about 60–70% for the best single site. |
| **Live scan** | Click anywhere and the app queries NASA POWER, the DEM and MODIS NDVI in the browser and fingerprints the point in seconds (8 of 15 axes measured live). |
| **🔥 Global heat map** | The whole land surface is scored on a 2.5° grid of NASA POWER climatology (`pipeline/global_grid.py`). Bright = alike. The app lists the most promising **uncatalogued zones**: the best cells more than 700 km from any known analog, which are candidates for *new* analogs. |
| **🌿 Measured vegetation** | The "no vegetation" axis comes from MODIS Terra MOD13Q1 NDVI (250 m, ORNL DAAC web service) for every site and every live scan (`pipeline/ndvi.py`). |
| **📷 Get to know the place** | A "Get to know the place" window for every site. It shows a Wikimedia Commons photo with author and licence, and the Wikipedia summary (Spanish or English). Below them is a **same-scale slider**: a 40 × 40 km Landsat view of the Earth site against the LRO WAC or Viking view of the target, both in the same local projection with one scale bar (`pipeline/site_views.py`, `pipeline/wiki.py`). |
| **🔄 Reverse twin** | Start from Earth: tap any place (or a catalog site) and the app tells you which Moon or Mars site it most resembles, then flies the globe there. |

## Key findings
- **Lunar lava-tube base (Mare Tranquillitatis pit):** the best twin is **Harrat Khaybar and the Umm Jirsan lava tube** (Saudi Arabia), a hyperarid basaltic field almost never used as an analog.
- **Arcadia Planitia ice (ISRU):** the **Changtang Plateau** (Tibet) ranks #1.
- **Lunar south pole (polar light):** **McMurdo Dry Valleys** and the untapped **Miller Range blue-ice fields** come out on top. A 3-site campaign covers 96% of the fingerprint.
- **Jezero (astrobiology):** the untapped Saharan sites **Gilf Kebir** and **Aorounga** stand out, together with Licancabur.
- **🇪🇨 Ecuador:** Galápagos lava fields (**Sierra Negra #8, Fernandina #9**) are in the global top 10 for lunar and Martian caves. **Arenal del Chimborazo** is the #3 untapped analog for Arcadia ice: 4,300 m, 1,549 m of measured relief, glacier ice, 3 h from Quito.

## Run it
No build step is needed.
```bash
python -m http.server 8765
```
Then open http://localhost:8765. Deep links work too, for example `#t=moon_shackleton&p=power&m=match`, which opens straight on a verdict for demos.

After changing any CSS/JS file, bump the `?v=` number on the `<link>`/`<script>` tags in `index.html` so browsers don't keep an old cached copy:
```bash
V=$(date +%Y%m%d%H%M); sed -i -E "s#(css/styles\.css|js/[a-z0-9]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html
```

## Rebuild the datasets
```bash
python pipeline/planetary.py
```
This downloads LOLA, MOLA and the Odyssey neutron map (about 70 MB) and streams the 605 MB Diviner table. The result is written to `data/planetary_measurements.json`.

```bash
python pipeline/build_data.py
```
This fetches NASA POWER and the Copernicus DEM for the Earth sites, then merges everything into `js/data.js`.

```bash
python pipeline/textures.py
```
This builds the globe textures from NASA GIBS and NASA Trek.

```bash
python pipeline/ndvi.py
```
This fetches MODIS NDVI for the catalog sites. Run `build_data.py` afterwards so the values are merged.

```bash
python pipeline/site_views.py
```
```bash
python pipeline/wiki.py
```
These build the same-scale satellite views (NASA GIBS Landsat/MODIS and NASA Trek) and the photos and summaries (Wikipedia/Commons).

```bash
python pipeline/global_grid.py
```
This builds the global heat-map grid from the NASA POWER regional API. It is resumable and polite, and takes about 30 minutes.

## Project layout
```
index.html               UI shell
css/styles.css
js/engine.js             fingerprint, similarity, campaign builder (pure functions)
js/app.js                3D globe (globe.gl), guided flow, launch animation, verdict, live scan
js/i18n.js               Spanish / English
js/data.js               generated dataset (45 Earth sites + 9 targets)
assets/                  globe textures (NASA GIBS Blue Marble, LRO WAC, Viking MDIM 2.1)
data/earth_sites.json    curated Earth catalog (terrain axes, usage, access)
data/targets.json        Moon/Mars targets, evidence, sources
data/planetary_measurements.json  output of planetary.py
pipeline/planetary.py    LOLA / MOLA / Diviner / Odyssey processing
pipeline/build_data.py   NASA POWER + DEM + merge
pipeline/textures.py     globe textures
docs/SUBMISSION.md       Space Apps project text and 30-s video script
```

## Data sources
- **NASA POWER** Climatology API v2 (2001–2025)
- **LRO LOLA** LDEM_16 and **MGS MOLA** MEGDR (16 px/deg), from the PDS Geosciences Node
- **LRO Diviner** Polar Resource Product (DLRE_PRP_SOUTH)
- **Mars Odyssey** Neutron Spectrometer epithermal map (GRS special products) and **MRO SHARAD** results (Plaut et al. 2009; Morgan et al. 2021)
- **NASA GIBS** Blue Marble and **NASA Trek** (LRO WAC, Viking MDIM 2.1) for the 3D globes
- **Copernicus GLO-90 DEM** through the Open-Meteo elevation API
- Mission measurements: MSL REMS and RAD, Mars 2020 MEDA, LADEE, LCROSS, CRaTER

## Honest limitations
- **What is measured:**
  - Earth sites: 6 climate axes, relief and vegetation (MODIS NDVI; Antarctic ice sites keep a literature value because MODIS has no data there).
  - Targets: relief, ice, seasonal light and polar cold.
  - Mission measurements fix the saturating axes (vacuum, cold, radiation).
- **What is estimated:** basalt, regolith, impact, caves, salts and sediments are literature-based estimates (v0.1), and the app labels them that way.
- **Global heat map:** it uses only the 6 climate axes, so it is a first screening. Tapping a cell runs the full live scan.
- **Odyssey neutrons:** they sense only the top ~1 m, with a footprint of hundreds of km.
- **NASA POWER resolution:** its grid is about 0.5°, which smooths out microclimates.
- **Lunar seasons:** the Moon's 14-day night is not a seasonal effect, so the "seasonal light" axis does not capture it.
- **Always beyond Earth:** vacuum, low gravity, cosmic rays and cold traps below 40 K.

---

## 🇪🇸 Resumen en español
**TwinWorlds** busca el "gemelo terrestre" de cada sitio de base en la Luna o Marte.

**Perfiles medidos con datos reales de NASA:**
- **Relieve:** LOLA en la Luna, MOLA en Marte y DEM Copernicus en la Tierra, con la misma métrica en los tres mundos.
- **Hielo:** Diviner en la Luna; Mars Odyssey más radar SHARAD en Marte.
- **Clima terrestre:** 25 años de NASA POWER.
- **Luz estacional:** un modelo orbital.

**Experiencia guiada:**
1. Eliges el destino en un globo 3D de la Luna o Marte.
2. Eliges la misión (ISRU, cuevas, movilidad…).
3. Lanzas la nave. La "computadora de misión" muestra el análisis y la nave aterriza en el mejor sitio de la Tierra con el veredicto: *"Según este análisis de datos, el mejor lugar es…"*.

**Además, la app permite:**
- Ver por qué se eligió el sitio y qué no puede simular.
- Revisar la evidencia de cada número.
- Armar una campaña de 3 sitios que cubre el 90–96% del objetivo.
- Escanear en vivo cualquier punto del planeta (clima, relieve y vegetación MODIS).
- Ver un **mapa de calor de toda la Tierra** con las zonas más parecidas que nadie ha catalogado.
- Usar el **gemelo inverso**: empiezas desde un lugar de la Tierra y te dice a qué sitio de la Luna o Marte se parece.

**Ecuador:** Sierra Negra y Fernandina (Galápagos) están en el top 10 mundial de análogos de tubos de lava. El Arenal del Chimborazo es el #3 de los análogos sin explotar para el hielo de Arcadia Planitia.
