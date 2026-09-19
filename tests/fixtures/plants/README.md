# Plant It identification corpus

Real photos with ground truth for testing `POST /api/identify` and the Add Plant flow end to end. Every file is under 300 KB (re-encoded to at most 1000 px, EXIF stripped), so the folder is committed directly; nothing here is a personal document.

| File | Ground truth (top-1 accepted) | Bundled care? | Difficulty |
|---|---|---|---|
| `monstera-deliciosa.jpg` | *Monstera deliciosa* | yes | clear |
| `monstera-deliciosa-2.jpg` | *Monstera deliciosa* (busy garden scene) | yes | hard |
| `epipremnum-aureum.jpg` | *Epipremnum aureum* or *E. pinnatum* (mature form) | yes (genus) | clear |
| `epipremnum-aureum-2.jpg` | *Epipremnum aureum* | yes | clear |
| `dracaena-trifasciata.jpg` | *Dracaena trifasciata* = *Sansevieria trifasciata* | yes (genus synonym) | clear |
| `dracaena-trifasciata-2.jpg` | *Dracaena trifasciata* = *Sansevieria trifasciata* | yes (genus synonym) | clear |
| `spathiphyllum-wallisii.jpg` | *Spathiphyllum wallisii* | yes (genus) | clear |
| `spathiphyllum-wallisii-2.jpg` | *Spathiphyllum wallisii* | yes (genus) | clear |
| `ficus-lyrata.jpg` | *Ficus lyrata* | yes | clear |
| `ficus-lyrata-2.jpg` | *Ficus lyrata* (whole tree, distant) | yes | hard |
| `aloe-vera.jpg` | *Aloe vera* (field, wide shot) | no (generic succulent rule) | hard |
| `chlorophytum-comosum.jpg` | *Chlorophytum comosum* | no | clear |
| `zamioculcas-zamiifolia.jpg` | *Zamioculcas zamiifolia* | no | clear |
| `pilea-peperomioides.jpg` | *Pilea peperomioides* | no | clear |
| `crassula-ovata.jpg` | *Crassula ovata* | no (generic succulent rule) | clear |
| `not-a-plant-mug.jpg` | not a plant (Pl@ntNet answers 404) | n/a | negative |
| `too-small.jpg` | ~1 KB, under the 10 KB minimum | n/a | negative |
| `not-an-image.txt` | text file | n/a | negative |

`ground-truth.json` holds the same table as data, plus each photo's Wikimedia Commons source and licence, and `plantnetCalibration`: what Pl@ntNet answered for these exact bytes on 2026-09-19 (top-1, score, top-3, latency). The measurable bars are in `bars` and in `docs/reports/plantit-spec.md` in the portfolio repo.

Note on the bundled library (found while calibrating): `backend/src/demoPlants.js` lists *Sansevieria trifasciata*, but Pl@ntNet returns the accepted name *Dracaena trifasciata*. Neither the exact name nor the genus matches the library, and `genericCare`'s succulent rule only knows the word "sansevieria", so a snake plant identified live gets the **base generic guide** ("water when the top 2-3 cm feels dry", threshold 20 %), which is the opposite of snake-plant care (water only when bone dry, threshold 8 %). Also *Zamioculcas* (ZZ, drought-tolerant) falls to the base generic guide. Both are care-guidance defects for the spec's story 3.

## Running the corpus

```bash
cd ~/projects/plantit
set -a; source ~/.config/portfolio-ops/secrets.env; set +a     # operator keys, never printed
node scripts/run-corpus.js --base https://plantit.kalpkan.com   # or http://localhost:3001 with the API running
```

The script mints a throwaway Firebase sign-in for uid `corpus-test` (service account from the `FIREBASE_*` variables, exchanged through the public Identity Toolkit endpoint with the app's public web API key), posts every fixture to `/api/identify`, scores the answers against `ground-truth.json`, prints a table plus PASS/FAIL per bar, and deletes the plants it created. It never prints tokens or keys. It spends up to 16 Pl@ntNet calls from the app's 50/day counter.

## Attribution

All photos are from Wikimedia Commons under the licence recorded per item in `ground-truth.json` (CC BY 4.0, CC BY-SA 4.0/2.5/2.0, CC0). Authors: Aqilla Rahmi, Daniel Capilla, Filo gèn', KIRUTHIKA OFF, Joyifeoma45, Rudolphous, Bernard DUPONT, Dguendel, ritirene, Thalia M. Mite, Holger Uwe Schmitt, Nguyễn Dương Khang, Muago, 29bgang, Didier Descouens, Kolforn. Files were resized and re-encoded; no other changes.
