# Pran Rekha

Pran Rekha is a source-linked patient-record prototype for the Ullens Hackathon. Patients choose which signed entries may be shared in an emergency; paramedics find the record by RFID card or QR locator and get a short-lived, audited view of only that approved scope; hospitals receive pre-arrival alerts; labs sign new entries.

The prototype is not a clinical system. It does not diagnose, recommend treatment, confirm current medication use, or contain real patient data.

The server seeds published demo accounts and synthetic records outside production. In production (`NODE_ENV=production`), it skips all fixture seeding, leaves login fields blank, and refuses to start with a database containing the built-in demo accounts or Siddharth demo profile. Use a clean database for production.

For a full plain-language tour of the code, see [CODEBASE_EXPLAINED.md](CODEBASE_EXPLAINED.md).

## Requirements

- Node.js 24 or newer (uses the built-in `node:sqlite`)
- npm 11 or newer

## Run the demo

```powershell
rtk npm install
rtk npm run dev
```

Open `http://localhost:5173`. The API (port 4100) creates `.data/pran-rekha-demo.sqlite` and the demo accounts on first start. Each portal pre-fills its own demo login:

| Portal | Username | Password |
|---|---|---|
| Patient (`/patient`) | `siddharth` | `pran-demo-siddharth` |
| Paramedic (`/paramedic`) | `paramedic` | `pran-demo-paramedic` |
| Hospital (`/hospital`) | `hospital` | `pran-demo-hospital` |
| Lab (`/lab`) | `lab` | `pran-demo-lab` |
| Break-glass approver (`/hospital`) | `approver` | `pran-demo-approver` |
| Admin (API only: readers, tags) | `admin` | `pran-demo-admin` |

Useful database commands:

- `rtk npm run demo:seed` wipes the demo database back to its fixtures. Restart the API afterwards; it re-creates the portal accounts and Siddharth's record on start.
- `rtk npm run demo:reset` deletes only `.data/pran-rekha-demo.sqlite` and its SQLite sidecars, and refuses to run unless `demo:seed` has written the synthetic-workspace marker.

Environment variables (`DATABASE_PATH`, `PORT`, `PUBLIC_ORIGIN`) are listed in `.env.example`; nothing loads that file automatically.

## Install on a phone (PWA)

The web app is installable: a manifest, icons, and the service worker turn it into a full-screen home-screen app. Phones only allow the camera, service worker, and install prompt over HTTPS, so `npm run phone` exposes the laptop through a free Cloudflare quick tunnel (no account or domain needed):

```powershell
rtk npm run phone
```

It builds the app, opens the tunnel, starts the API and web servers with the tunnel URL added to `PUBLIC_ORIGIN` (otherwise logins from the phone are rejected), and prints the `https://…trycloudflare.com` URL with a QR code. Scan it, log in, then use **Install app** (Android Chrome) or **Share → Add to Home Screen** (iOS Safari). Stop `npm run dev` first, since both use ports 5173 and 4100. Pass `-- --skip-build` to reuse the last build. The URL changes every run, so reinstall the app each time. Everything stays on the laptop; Ctrl+C closes the tunnel.

For a USB-connected Android phone, `chrome://inspect` → Port forwarding `5173 → localhost:5173` also works, because `localhost` counts as secure. `npm run dev:https --workspace @pran-rekha/web` serves a self-signed certificate on the LAN, but phones won't trust it, so the camera works only after accepting the warning and the service worker won't register.

To change the branding, replace `apps/web/assets/logo-wordmark.png` (header and offline page) and `apps/web/assets/icon.png` (the square-ish mark used for app icons and favicon, currently the heartbeat cropped from the wordmark), then run `rtk npm run icons --workspace @pran-rekha/web`.

## Verification

```powershell
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
```

`test:e2e` runs Playwright against the production build (`npm run build` first) in headless Microsoft Edge, using a throwaway `.data/e2e.sqlite`. Stop `npm run dev` before running it.

## Workspace map

- `apps/web`: Next.js patient, paramedic, hospital and lab portals (PWA)
- `server`: Express API, session boundary, SQLite storage, and seed/reset scripts
- `packages/contracts`: shared Zod schemas and wire types
- `packages/domain`: pure medication lifecycle rules
- `scripts`: phone tunnel, RFID simulator, and demo card enrollment
- `firmware`: ESP32 and Arduino Uno + Raspberry Pi RFID readers (see `docs/RFID.md`, `docs/RFID_UNO.md`)
- `tests`: unit, API and browser checks

## Boundaries

Synthetic demo data only; no clinical review or public deployment. Face lookup is candidate-only and never unlocks a record. Face photos and descriptors saved at hospital registration are stored in the demo SQLite database and served only to hospital staff. The Nepali interface text is a draft pending native-speaker review; no native-script product name has been asserted.
