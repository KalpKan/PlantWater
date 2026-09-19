# Plant It

Identify a plant from a photo, get a care guide, and keep an eye on its soil moisture. Live at **https://plantit.kalpkan.com** (part of [kalpkan.com](https://kalpkan.com)).

No hardware is needed to use it: every plant gets a **simulated moisture sensor** that dries out over about three days and a **Water now** button that logs a real watering event. The ESP8266 watering device in `arduino/` is optional and, as of now, does not report readings back to the app (see step 5 below), so the simulation stays in charge even with a device built.

## What it does

1. **Sign in with Google** (Firebase Authentication).
2. **Upload a photo** (JPEG/PNG/WebP, 10 KB to 4 MB). The API shrinks it, identifies the species with [Pl@ntNet](https://my.plantnet.org/) when a key is configured, and stores the photo in Supabase Storage. A photo with no plant in it (a mug, a wall) is refused with "This does not look like a plant" and nothing is saved. When Pl@ntNet is less than 30 % sure, the results page says **Low confidence**, lists the other candidates it suggested, and the plant carries a "Low confidence" mark in My Plants so you can delete it if it is wrong.
3. **Care guide**: six common houseplants (Monstera, pothos, snake plant, peace lily, ZZ plant, fiddle-leaf fig, found under their current and older botanical names) are answered from a built-in library; anything else gets sensible general guidance, with succulents and other drought-tolerant plants told to dry out completely between waterings. **Optional, bring your own key**: under *Add Plant* there is a "Use your own OpenAI key" field. A key typed there is kept only in your browser's localStorage, sent with each identification request in an `X-OpenAI-Key` header, used for that one OpenAI call, and never stored or logged by the server. With it, OpenAI writes a species-specific guide on your account; if OpenAI rejects the key the built-in guide is shown and the page says why. Logging out clears the key. The hosted app itself has no OpenAI key (no paid keys in public demos), so this field is the only way to get OpenAI guides.
4. **My Plants**: each plant shows its soil moisture, a watering threshold, a Water now button and the last waterings. Readings are labelled **Simulated sensor** until a real ESP8266 posts a reading, then **Live sensor**.
5. **Hardware (optional, not finished)**: "Connect ESP8266 (hardware required)" sends the plant's moisture targets and a device secret to an ESP8266 on your home network (it only works when the API runs on your computer, not from the hosted site). **The firmware does not yet send readings back**: it stores what it was given but never calls the `/moisture` route, so a plant never switches to live readings today. Building the device now gets you a pump that waters on a schedule, not a live moisture graph; the reporting step is planned for the hardening pass (T5.b). Until then every plant, hardware or not, keeps the simulated sensor.

### Demo mode, and why it exists

Without a Pl@ntNet key the app still identifies plants: the result is drawn from a bundled list of six common houseplants (the same photo always gives the same answer) and is clearly marked **Demo result** in the app and `demo: true` in the API. Care guides come from the built-in library or generic guidance unless the visitor brings their own OpenAI key. So the whole app works for a visitor at $0.

### Spend guard (never a surprise bill)

Pl@ntNet, the only provider the server pays for, is behind a per-day counter kept in Firestore (`spend/plantnet_<YYYY-MM-DD>`), default **50 calls per day** (`PLANTNET_DAILY_LIMIT`). Past the cap, or if Firestore is unreachable, the demo answers are used instead of spending. `GET /api/health` shows today's count. OpenAI calls only ever run on a visitor's own key, so they need no server-side cap.

## How to run this (on your computer)

You need Node.js 22 and the values listed in `.env.example`.

```bash
git clone https://github.com/KalpKan/PlantWater plantit && cd plantit
npm install                      # API dependencies
npm --prefix frontend install    # web app dependencies
cp .env.example .env             # then fill in the Firebase and Supabase values
npm run dev:api                  # API on http://localhost:3001  (check http://localhost:3001/api/health: 200 once .env has the Firebase values, 503 "Firebase Admin not configured" before)
npm run dev:web                  # web app on http://localhost:3000 (proxies /api to :3001)
npm test                         # API tests (spend guard, simulated sensor, demo plants, routes, device secret, legacy photos, visitor OpenAI key, the offline identification corpus in backend/src/corpus.test.js) then the frontend tests (photo placeholder, OpenAI key field, low-confidence page, not-found page, button contrast). GitHub Actions runs the same on every push (.github/workflows/ci.yml)
node scripts/run-corpus.js --base https://plantit.kalpkan.com   # the same corpus against a live API (16 Pl@ntNet calls; --only mug,dracaena for a cheap subset); see tests/fixtures/plants/README.md
```

The web app's own settings (`REACT_APP_*`) go in `frontend/.env.local`; the API's settings go in the root `.env`. Neither file is committed.

## How to deploy this

Hosting is one **Vercel** project called `plantit` (free Hobby plan) that serves the built React app as static files and runs the Express API as one serverless function (`api/index.js`). Every push to `main` on GitHub deploys automatically; to deploy by hand:

```bash
npx vercel --prod --yes --scope kks-projects-2edcb11a
```

What Vercel does (from `vercel.json`): `npm run build` builds the frontend into `frontend/build`; `/api/*` goes to the Express function; `/ingest/*` is the PostHog analytics proxy; everything else serves the single-page app. The image resizer is **`sharp`** (Vercel's Linux builder installs the `linux-x64` binary from the lockfile); if it ever fails to load, the API sends the original photo bytes instead of crashing, and `/api/health` reports `"image": "none"`.

The domain `plantit.kalpkan.com` is a DNS-only CNAME in Cloudflare pointing at this Vercel project (see the portfolio ops skill, runbook "Attach a domain to a Vercel project").

## Where the settings live

All real values are in **Vercel → project `plantit` → Settings → Environment Variables** (production and preview). Nothing secret is in this repository; `.env.example` lists every name.

| Setting | What it is | Where the value comes from |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Lets the API read/write Firestore and the Realtime Database and verify sign-ins | Firebase console → project **plant-it-5e2fc** → Project settings → Service accounts → Generate new private key (the JSON's `project_id`, `client_email`, `private_key`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Where plant photos are stored (bucket `plantit-photos`, public-read, 5 MB, images only) | Supabase → project **platform** → Settings → API |
| `PLANTNET_API_KEY` | Real species identification (optional; demo mode without it) | https://my.plantnet.org/ → account → API key (free tier: 500 requests/day) |
| `PLANTNET_DAILY_LIMIT` | Per-day cap on Pl@ntNet calls (default 50) | you choose |
| `OPENAI_MODEL` | Model used when a visitor brings their own OpenAI key (default `gpt-4o-mini`) | optional |
| `REACT_APP_POSTHOG_KEY`, `REACT_APP_POSTHOG_HOST` | Visitor analytics (PostHog project "Kalp portfolio"); host is always `/ingest` | PostHog → project settings |

There is deliberately **no `OPENAI_API_KEY` setting**: the API does not read one, so setting it does nothing. OpenAI is only called with a key a visitor typed into the app (see "Care guide" above).

Firebase stays on the free **Spark** plan. Only Authentication, Firestore and the Realtime Database are used; Firebase Storage is not (it now requires the paid Blaze plan), which is why photos live in Supabase. **Never upgrade Firebase to Blaze for this app.**

**Photos of plants added before September 2026** were stored in Firebase Storage. Those files still exist, but Google refuses every download ("billing account ... closed", HTTP 403), even to the app's own service account, so they cannot be copied to Supabase without paying for Blaze. The app therefore shows a labelled placeholder ("Photo no longer available") on those plants instead of a broken image; the API reports them as `photoStatus: "unavailable"` and keeps the old link in `legacyImageUrl`. To get a photo back, add the plant again from a photo (new uploads go to Supabase and keep working).

Sign-in works from these hosts because they are on Firebase Authentication's authorized-domain list: `plantit.kalpkan.com`, `plantit-kappa.vercel.app` (Vercel's fallback address for this project), `localhost`. A new host must be added there (Firebase console → Authentication → Settings → Authorized domains) or Google sign-in shows `auth/unauthorized-domain`.

## API

All routes are under `/api`. Routes marked "signed in" need `Authorization: Bearer <Firebase ID token>`.

| Route | Who | What |
|---|---|---|
| `GET /api/health` | anyone | `{ ok, service: "plantit", firestore: "ok"\|"error", photos, identification: "plantnet"\|"demo", care: "bundled", careWithVisitorKey: "openai", image, spend }`; 503 when Firestore does not answer |
| `POST /api/identify` (multipart field `image`; optional header `X-OpenAI-Key`) | signed in | identify, write the care guide, store the photo, save the plant. `422 {notAPlant: true}` when Pl@ntNet finds no plant in the photo (nothing is uploaded or saved); `lowConfidence: true` when the top score is under 0.3 (all candidates, up to five, are returned). The response's `careSource` is `bundled`, `generic` or `openai` (visitor key); `careReason`/`openaiError` explain a fallback |
| `GET /api/plants`, `DELETE /api/plants/:id` | signed in | list / delete (also removes the photo). Each plant carries `photoStatus`: `ok`, `none`, or `unavailable` (pre-2026 Firebase Storage photo that can no longer be downloaded; `imageUrl` is then `null`) |
| `GET /api/plants/:id/device` | signed in | `{ mode: "simulated"\|"hardware", reading, events }` |
| `POST /api/plants/:id/water` | signed in | logs a watering event; simulated mode resets the reading, hardware mode leaves the reading to the sensor's next report |
| `GET /api/plant/:species/care` (optional header `X-OpenAI-Key`) | signed in | care guide only |
| `POST /api/plants/:id/moisture`, `GET /api/plants/:id/moisture/:userId` | the ESP8266, header `X-Device-Secret` | device reports a reading / reads its targets (hardware). The secret is issued by connect-device and sent to the device; without it the API answers 403, so a uid + plant id alone cannot fake a sensor |
| `POST /api/plants/:id/connect-device`, `.../disconnect-device`, `GET /api/discover-devices` | signed in | hardware required: only private home-network IPs (10.x, 172.16-31.x, 192.168.x) and ports 1-65535 are accepted, and the hosted API on Vercel always answers 502 `hardwareRequired` (run the API locally to connect a device); discovery only when the API runs on the home network with `DEVICE_DISCOVERY_SUBNET` |

## Repository layout

```
api/index.js          Vercel serverless entry (exports the Express app)
backend/src/          Express API: app.js (routes), firebase.js, storage.js (Supabase), providers.js (Pl@ntNet/OpenAI + demo),
                      spendGuard.js, simulatedDevice.js, demoPlants.js, *.test.js
frontend/             React app (Create React App + MUI); src/analytics.js is the PostHog snippet; src/openaiKey.js + components/OpenAiKeyField.js hold the optional visitor OpenAI key (browser localStorage only)
firebase/             Firestore and Realtime Database security rules (deploy with `firebase deploy --only firestore:rules,database`)
arduino/              ESP8266 firmware and wiring notes (optional hardware)
vercel.json           build, routes, analytics proxy
```

## Data

Firestore: `users/{uid}/plants/{plantId}` (species, care guide, moisture targets, `lastWatered`, `imageUrl`, `deviceReportedAt`, and after connect-device a `deviceSecret` that only the ESP8266 receives) with an `events` subcollection (waterings) and `spend/{service_day}` counters. Realtime Database mirrors each plant's moisture targets at `plants/{uid}/{plantId}` for the device. Photos: Supabase Storage `plantit-photos/{uid}/{plantId}.jpg`.

## License

MIT
