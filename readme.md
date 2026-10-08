# Pran Rekha

Pran Rekha is a source-linked patient-record prototype for the Ullens Hackathon, with patient, paramedic, hospital and lab portals over synthetic demo data.

The prototype is not a clinical system. It does not diagnose, recommend treatment, confirm current medication use, or contain real patient data.

## Requirements

- Node.js 24 or newer
- npm 11 or newer

## Run the demo

```powershell
rtk npm install
rtk npm run demo:seed
rtk npm run dev
```

Open `http://localhost:5173` and sign in with a demo account, for example:

- Patient: `siddharth` / `pran-demo-siddharth`
- Paramedic: `paramedic` / `pran-demo-paramedic`
- Hospital: `hospital` / `pran-demo-hospital`
- Lab: `lab` / `pran-demo-lab`

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
```

`demo:seed` recreates the deterministic records using the clock `2026-10-03T04:30:00.000Z`. `demo:reset` removes only `.data/pran-rekha-demo.sqlite` and its SQLite sidecars, and refuses to run without the matching synthetic-workspace marker.

## Workspace map

- `apps/web`: Next.js patient, paramedic, hospital and lab portals
- `server`: Express API, session boundary, SQLite migrations, and seed/reset scripts
- `packages/contracts`: shared Zod schemas and wire types
- `packages/domain`: pure medication lifecycle rules
- `tests`: unit, API and browser checks

## Boundaries

Synthetic demo data only; no clinical review or public deployment. Hospital face lookup is candidate-only: registered face photos and descriptors are stored in the demo SQLite database. The Nepali interface text is a draft pending native-speaker review; no native-script product name has been asserted.
