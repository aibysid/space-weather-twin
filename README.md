# Space Weather Twin

An educational Sun–Earth dashboard combining independent NOAA observations, provider aurora/Kp forecasts, NASA OMNI replay, and hypothetical calculations. It is not an operational forecast or validated physical digital twin.

[Open the public application](https://aibysid.github.io/space-weather-twin/#/live) · [Source repository](https://github.com/aibysid/space-weather-twin)

## Run locally

Use Node 24 LTS and npm. `npm ci`, `npm run dev`. Open the printed `/space-weather-twin/` URL. Production: `npm run build`, `npm run preview`.

Required checks: `npm run lint`, `npm run typecheck`, `npm test`, `npx playwright install chromium`, `npm run test:e2e`. Network checks are separate: `npm run feeds:verify`, `npm run history:build`, `npm run snapshot:build`.

## Screens

- `#/live`: timestamped independent observations, Sun–Earth schematic and synchronized charts.
- `#/aurora`: NOAA OVATION polar maps, both hemispheres and manual location inspection.
- `#/replay`: immutable NASA hourly observations or frozen loaded recent observations.
- `#/lab`: applied hypothetical solar-wind/CME inputs, baseline comparison and illustrative motion.
- `#/sources`: per-feed health, provenance, methods and authoritative references.

## Science and privacy

Observations, NOAA forecasts, calculations, illustrations and scenarios are distinct. Missing/invalid values remain unavailable; no invented telemetry. NOAA quality and channel selection occur before calculation. UTC throughout. No credentials, paid services, accounts, analytics or automatic location storage. Shared URLs contain selected coordinates.

See [operations](docs/runbook.md), [architecture](docs/architecture.md), [acceptance evidence](docs/acceptance.md), [decisions](docs/decisions.md), and [notices](THIRD_PARTY_NOTICES.md). New code is MIT.
