# Plant It

Identify a plant from a photo, get a care guide, and keep an eye on its soil moisture. Live at **https://plantit.kalpkan.com** (part of [kalpkan.com](https://kalpkan.com)).

No hardware is needed to use it: every plant gets a **simulated moisture sensor** that dries out over about three days and a **Water now** button that logs a real watering event. If you build the ESP8266 watering device in `arduino/`, it takes over from the simulation for that plant.

## What it does

1. **Sign in with Google** (Firebase Authentication).
2. **Upload a photo** (JPEG/PNG/WebP, 10 KB to 4 MB). The API shrinks it, identifies the species with [Pl@ntNet](https://my.plantnet.org/) when a key is configured, and stores the photo in Supabase Storage.
3. **Care guide**: five common houseplants are answered from a built-in library; anything else asks OpenAI when a key is configured, otherwise sensible general guidance.
4. **My Plants**: each plant shows its soil moisture, a watering threshold, a Water now button and the last waterings. Readings are labelled **Simulated sensor** until a real ESP8266 posts a reading, then **Live sensor**.
5. **Hardware (optional)**: "Connect ESP8266 (hardware required)" sends the plant's moisture targets to a device on your home network.

### Demo mode, and why it exists

Without a Pl@ntNet key the app still identifies plants: the result is drawn from a bundled list of five common houseplants (the same photo always gives the same answer) and is clearly marked **Demo result** in the app and `demo: true` in the API. Without an OpenAI key, care guides come from the built-in library or generic guidance. So the whole app works for a visitor at $0.

### Spend guard (never a surprise bill)

Each paid provider is behind a per-day counter kept in Firestore (`spend/<service>_<YYYY-MM-DD>`), default **50 calls per day** each (`PLANTNET_DAILY_LIMIT`, `OPENAI_DAILY_LIMIT`). Past the cap, or if Firestore is unreachable, the demo answers are used instead of spending. `GET /api/health` shows today's counts.

## How to run this (on your computer)

You need Node.js 22 and the values listed in `.env.example`.

```bash
git clone https://github.com/KalpKan/PlantWater plantit && cd plantit
npm install                      # API dependencies
npm --prefix frontend install    # web app dependencies
cp .env.example .env             # then fill in the Firebase and Supabase values
npm run dev:api                  # API on http://localhost:3001  (check http://localhost:3001/api/health)
npm run dev:web                  # web app on http://localhost:3000 (proxies /api to :3001)
npm test                         # 24 unit + route tests (spend guard, simulated sensor, demo plants, API)
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
| `OPENAI_API_KEY` | Species-specific care guides (optional; built-in library without it) | https://platform.openai.com/ → API keys. Set a low monthly budget there too |
| `PLANTNET_DAILY_LIMIT`, `OPENAI_DAILY_LIMIT` | Per-day caps (default 50) | you choose |
| `REACT_APP_POSTHOG_KEY`, `REACT_APP_POSTHOG_HOST` | Visitor analytics (PostHog project "Kalp portfolio"); host is always `/ingest` | PostHog → project settings |

Firebase stays on the free **Spark** plan. Only Authentication, Firestore and the Realtime Database are used; Firebase Storage is not (it now requires the paid Blaze plan), which is why photos live in Supabase. **Never upgrade Firebase to Blaze for this app.**

Sign-in works from these hosts because they are on Firebase Authentication's authorized-domain list: `plantit.kalpkan.com`, `plantit.vercel.app`, `localhost`. A new host must be added there (Firebase console → Authentication → Settings → Authorized domains) or Google sign-in shows `auth/unauthorized-domain`.

## API

All routes are under `/api`. Routes marked "signed in" need `Authorization: Bearer <Firebase ID token>`.

| Route | Who | What |
|---|---|---|
| `GET /api/health` | anyone | `{ ok, service: "plantit", firestore: "ok"\|"error", photos, identification: "plantnet"\|"demo", care: "openai"\|"bundled", image, spend }`; 503 when Firestore does not answer |
| `POST /api/identify` (multipart field `image`) | signed in | identify, write the care guide, store the photo, save the plant |
| `GET /api/plants`, `DELETE /api/plants/:id` | signed in | list / delete (also removes the photo) |
| `GET /api/plants/:id/device` | signed in | `{ mode: "simulated"\|"hardware", reading, events }` |
| `POST /api/plants/:id/water` | signed in | logs a watering event, resets the reading |
| `GET /api/plant/:species/care` | signed in | care guide only |
| `POST /api/plants/:id/moisture`, `GET /api/plants/:id/moisture/:userId` | the ESP8266 | device reports a reading / reads its targets (hardware) |
| `POST /api/plants/:id/connect-device`, `.../disconnect-device`, `GET /api/discover-devices` | signed in | hardware required; discovery only when the API runs on the home network with `DEVICE_DISCOVERY_SUBNET` |

## Repository layout

```
api/index.js          Vercel serverless entry (exports the Express app)
backend/src/          Express API: app.js (routes), firebase.js, storage.js (Supabase), providers.js (Pl@ntNet/OpenAI + demo),
                      spendGuard.js, simulatedDevice.js, demoPlants.js, *.test.js
frontend/             React app (Create React App + MUI); src/analytics.js is the PostHog snippet
firebase/             Firestore and Realtime Database security rules (deploy with `firebase deploy --only firestore:rules,database`)
arduino/              ESP8266 firmware and wiring notes (optional hardware)
vercel.json           build, routes, analytics proxy
```

## Data

Firestore: `users/{uid}/plants/{plantId}` (species, care guide, moisture targets, `lastWatered`, `imageUrl`, `deviceReportedAt`) with an `events` subcollection (waterings) and `spend/{service_day}` counters. Realtime Database mirrors each plant's moisture targets at `plants/{uid}/{plantId}` for the device. Photos: Supabase Storage `plantit-photos/{uid}/{plantId}.jpg`.

## License

MIT
