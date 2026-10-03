# Pran Rekha

Pran Rekha is a source-linked patient-record prototype for the Ullens Hackathon. This G0 vertical slice demonstrates one synthetic patient claim, one prescription state derived from immutable evidence, and patient-specific authorization at the API boundary.

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

Open `http://localhost:5173` and use the prefilled synthetic patient credentials:

- Username: `maya.patient`
- Password: `pran-demo-patient`

The clinician fixture (`demo.clinician` / `pran-demo-clinician`) is deliberately unable to read the patient record because G0 does not implement emergency grants.

## Verification

```powershell
rtk npm run typecheck
rtk npm run test
rtk npm run build
```

`demo:seed` recreates the deterministic records using the clock `2026-10-03T04:30:00.000Z`. `demo:reset` removes only `.data/pran-rekha-demo.sqlite` and its SQLite sidecars, and refuses to run without the matching synthetic-workspace marker.

## Workspace map

- `apps/web`: React and Vite patient dashboard
- `server`: Express API, session boundary, SQLite migrations, and seed/reset scripts
- `packages/contracts`: shared Zod schemas and wire types
- `packages/domain`: pure evidence and medication rules
- `fixtures`: frozen synthetic source document and truth manifest
- `tests`: domain and service-boundary checks

## G0 boundaries

Included: fixture authentication, source-linked patient timeline, exact source preview, prescription derivation, English/Nepali UI toggle, and negative access tests.

Not included: document uploads, emergency grants or cards, NFC, offline snapshots, OCR, clinical review, or public deployment. Hospital face lookup is candidate-only: registered face photos and descriptors are stored in the demo SQLite database (see `health_plan.md` §5.2). The Nepali interface text is a draft pending native-speaker review; no native-script product name has been asserted.
