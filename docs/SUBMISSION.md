# Space Apps 2026 – Project submission text (TwinWorlds)

> Paste these sections into the Space Apps project page. Replace the links in [brackets] before you submit.

## Project name
**TwinWorlds: Find Earth's twin for every Moon & Mars base site**

## High-level summary (≤ 200 words)
Before astronauts build a base at the lunar south pole or drill for ice on Mars, they rehearse in places on Earth that behave like those worlds. Yet analog sites are rarely compared with a destination quantitatively, and new candidates are seldom searched for.

TwinWorlds measures every place on the same 15 axes using open NASA data:
- **Earth climate:** 25 years of NASA POWER.
- **Relief:** LRO LOLA, MGS MOLA and the Copernicus DEM, measured with the same metric on three worlds.
- **Ice:** LRO Diviner and the Mars Odyssey neutron map.
- **Light:** an orbital insolation model.

A guided 3D experience lets a planner pick a Moon or Mars base site and a mission goal, then "launch". A mission computer runs the analysis, a ship flies to Earth, and it lands on the best twin with an explained verdict: why the site was chosen and what it cannot simulate.

TwinWorlds also does three more things:
- It surfaces **untapped analogs** nobody uses yet.
- It builds **3-site campaigns** that cover 89–96% of a target.
- It **fingerprints any clicked point on Earth live**.

## Links
- Demo: [GitHub Pages URL]
- Code: [GitHub repo URL]
- 30-s video / slides: [link]

## Project details
**How it works**
1. **Earth fingerprint.** NASA POWER climatology gives six axes:
   - aridity, from PRECTOTCORR and RH2M
   - cold, from T2M
   - thermal swing, from T2M_RANGE
   - thin air, from PS corrected to the true DEM elevation
   - solar/UV exposure, from ALLSKY_SFC_SW_DWN and the UV index
   - seasonal light, from the darkest/brightest month ratio

   Relief comes from the Copernicus GLO-90 DEM.
2. **Measured planetary profiles** (`pipeline/planetary.py`, raw PDS data):
   - **Relief** uses the same P95–P5 / 15 km metric on all three worlds: LRO LOLA LDEM_16 on the Moon and MGS MOLA MEGDR on Mars.
   - **Lunar ice and cold:** we stream the 605 MB LRO Diviner Polar Resource Product (2.88 M mesh elements). For Shackleton, ice is stable within 1 m in 35% of the area and the mean surface temperature is 120 K.
   - **Martian ice:** the Mars Odyssey neutron epithermal map, combined with SHARAD radar results for buried glaciers.
   - **Seasonal light:** an orbital insolation model built from NASA Planetary Fact Sheet elements, using the same formula as Earth.
   - **Saturating axes** (vacuum or 0.6 kPa, -60 °C, radiation) use rover and orbiter measurements (REMS, MEDA, RAD, LADEE, CRaTER) and are clipped to Earth's extreme.
3. **Provenance.** Every axis is labeled *measured*, *mission* or *literature* in an Evidence tab.
4. **Similarity.** The score is 100 × (1 − weighted RMS distance), with weights set by the mission profile.
5. **Untapped analogs.** The opportunity score is similarity × (1 − 0.75 × current usage).
6. **Campaign builder.** A greedy weighted max-coverage pass picks 3 complementary sites. The coverage gap shows what Earth cannot reproduce.
7. **Live scan.** The browser calls NASA POWER (CORS-enabled) and the DEM for any clicked point.

**Benefits**
- Mission teams get a quantitative, explainable reason to choose a test site, and they know what it *cannot* test.
- The tool points field science toward under-characterized regions.
- It is open and reproducible. It runs from static files, needs no API key, and the pipeline rebuilds everything from public archives.

**Findings from the current dataset**
- *Lunar lava-tube base (Mare Tranquillitatis pit, caves profile):* **Harrat Khaybar and the Umm Jirsan lava tube (Saudi Arabia)** score 72/100. It is a hyperarid basaltic field almost never used as a space analog.
- *Arcadia Planitia ice (ISRU):* the **Changtang Plateau (Tibet)** ranks #1, with 52 kPa pressure, permafrost and an arid climate.
- *Lunar south pole (polar light):* **McMurdo Dry Valleys** and the untapped **Miller Range blue-ice fields** come out on top. A 3-site campaign (McMurdo + Dome C + Aorounga) covers 96%.
- *Jezero (astrobiology):* the untapped Saharan sites **Gilf Kebir** and **Aorounga** stand out, together with Licancabur.
- *Ecuador as an accessible node:* the Galápagos shields **Sierra Negra (#6)** and **Fernandina (#9)** rank in the global top 10 for lunar and Martian lava-tube caves. **Arenal del Chimborazo** (4,300 m, 1,549 m of measured relief, glacier ice, 3 h from Quito) is the #3 untapped analog for Arcadia ice.

**Tools**
HTML/CSS/JavaScript, globe.gl (Three.js), Chart.js, Python 3 + NumPy + Pillow.

**Creativity**
Analog selection becomes a recommender problem with measured, comparable fingerprints across three worlds. The question changes from "which famous site?" to "which combination of sites covers this mission, and what is left?". The result is told as a mission story: launch, travel, landing and verdict.

**Limitations**
- Seven terrain axes are still literature-based estimates (v0.1), and the app labels them that way. The next step is GLiM lithology, MODIS NDVI, permafrost zonation and the Earth Impact Database.
- Odyssey neutrons see only the top ~1 m at coarse resolution.
- NASA POWER's grid is about 0.5°.
- Scores support decisions. They do not certify sites.

## NASA data used
- NASA POWER Climatology API (2001–2025): https://power.larc.nasa.gov
- LRO LOLA LDEM_16; MGS MOLA MEGDR; LRO Diviner Polar Resource Product; Mars Odyssey GRS/NS epithermal map, all from the PDS Geosciences Node: https://pds-geosciences.wustl.edu
- NASA GIBS (Blue Marble): https://gibs.earthdata.nasa.gov
- NASA Moon Trek and Mars Trek (LRO WAC mosaic, Viking MDIM 2.1): https://trek.nasa.gov
- Mission measurements cited: MRO SHARAD, MSL REMS and RAD, Mars 2020 MEDA, LADEE, LCROSS, LRO CRaTER, LRO Mini-RF

## Other space agency / open data
- Copernicus GLO-90 DEM (ESA) through the Open-Meteo elevation API
- Chandrayaan-1 M3 (ISRO) and Kaguya (JAXA), cited in the target evidence

## Use of AI
An AI coding assistant (Claude) helped write the code, the data pipeline and this text. The team reviewed the data choices and the scoring.

---

## 30-second video script
| Time | On screen | Voice |
|---|---|---|
| 0–5 s | Rotating Earth, title "Where is the Moon… on Earth?" | "Before we live on the Moon, we rehearse on Earth. But which place on Earth is *most* like the Moon?" |
| 5–12 s | 3D Moon; pick Shackleton and the Polar light mission; Launch; the mission computer types Diviner and LOLA numbers | "TwinWorlds measures the Moon with LRO data and the Earth with 25 years of NASA POWER climate." |
| 12–20 s | The ship flies to Earth, score towers rise, and it lands; verdict card | "Based on this data analysis, here is the best place on Earth to rehearse, and what it can't simulate." |
| 20–25 s | Campaign tab: arcs between 3 sites at 96% | "No single place is the Moon, so it builds the best 3-site campaign." |
| 25–30 s | Scan tab: click on Ecuador | "Click anywhere and it becomes a candidate in seconds. TwinWorlds." |
