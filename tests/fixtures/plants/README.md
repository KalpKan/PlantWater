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
| `not-a-plant-mug.jpg` | not a plant (Pl@ntNet answers 404; the API answers 422 `notAPlant`) | n/a | negative |
| `too-small.jpg` | ~1 KB, under the 10 KB minimum | n/a | negative |
| `not-an-image.txt` | text file | n/a | negative |

`ground-truth.json` holds the same table as data, plus each photo's Wikimedia Commons source and licence, and `plantnetCalibration`: what Pl@ntNet answered for these exact bytes on 2026-09-19 (top-1, score, top-3, latency). The measurable bars are in `bars` and in `docs/reports/plantit-spec.md` in the portfolio repo.

Note on the bundled library (found while calibrating, fixed in FIX round 1): `backend/src/demoPlants.js` used to list *Sansevieria trifasciata* only, while Pl@ntNet returns the accepted name *Dracaena trifasciata*, so a live snake plant got the base generic guide (threshold 20 %) and so did *Zamioculcas*. The library entry is now *Dracaena trifasciata* with the old names as `synonyms`, the ZZ plant has its own entry, and `genericCare`'s dry-out rule also knows zamioculcas/kalanchoe/agave and friends. Each item in `ground-truth.json` now carries a `careBar` (threshold range + wording) that both `scripts/run-corpus.js` and `backend/src/corpus.test.js` check.

`backend/src/corpus.test.js` replays the recorded `plantnetCalibration` answers through the real API (multer, sharp, providers, care, the Firestore write) with no network, so `npm test` scores the same bars offline on every push: genus/species/top-3 counts, negatives 3/3 (mug 422), `lowConfidence` == (score < 0.3), and the care bars.

## Running the corpus

```bash
cd ~/projects/plantit
set -a; source ~/.config/portfolio-ops/secrets.env; set +a     # operator keys, never printed
node scripts/run-corpus.js --base https://plantit.kalpkan.com   # or http://localhost:3001 with the API running
```

The script mints a throwaway Firebase sign-in for uid `corpus-test` (service account from the `FIREBASE_*` variables, exchanged through the public Identity Toolkit endpoint with the app's public web API key), posts every fixture to `/api/identify`, scores the answers against `ground-truth.json`, prints a table plus PASS/FAIL per bar, and deletes the plants it created. It never prints tokens or keys. It spends up to 16 Pl@ntNet calls from the app's 50/day counter.

## Attribution

All photos are from Wikimedia Commons under the licence recorded per item in `ground-truth.json` (CC BY 4.0, CC BY-SA 4.0/2.5/2.0, CC0). Authors: Aqilla Rahmi, Daniel Capilla, Filo gèn', KIRUTHIKA OFF, Joyifeoma45, Rudolphous, Bernard DUPONT, Dguendel, ritirene, Thalia M. Mite, Holger Uwe Schmitt, Nguyễn Dương Khang, Muago, 29bgang, Didier Descouens, Kolforn. Files were resized and re-encoded; no other changes.
