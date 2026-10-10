# Operations and rollback

Use Node 24 LTS. Clone the public repository and run `npm ci`. `npm run dev` serves the app at the project base `/space-weather-twin/`. Run lint, typecheck, unit tests, build, then E2E (install Chromium once using `npx playwright install chromium`). No secrets or environment file are needed.

## Feeds and snapshots

`npm run feeds:verify` writes a timestamped integration report. Browser production-origin fetch evidence is separate. Direct NOAA feeds are the current path; hourly snapshots are a resilience fallback and often stale. Sources exposes each transport and original collection/observation time. `npm run snapshot:build` validates each response before atomic per-file replacement; failed feeds retain their last valid file.

Manual refresh: `gh workflow run snapshot.yml -R aibysid/space-weather-twin`. The schedule runs at minute 17 hourly and may be delayed or disabled by GitHub after inactivity. No paid runners/storage/API. Check failures under Actions. The isolated data-cache branch contains only latest snapshots; its orphan commits replace branch history each run, preventing growing archive storage. The source branch contains recorded test fixtures, not current cache state.

Provider outage: inspect Sources, compare direct response and snapshot age, check Actions and browser network. Do not proxy through public websites or disable browser security. Keep unaffected feeds operational. Old values retain timestamps. Restore only after validated acquisition. Unknown quality semantics disable derived inputs.

## NASA history

`npm run history:build` acquires exactly three fixed HAPI windows and metadata. Requires NASA network access. For byte-reproducible normalization from the committed raw responses, `node scripts/history.mjs --from-raw`. Ordinary builds never fetch NASA. If a local route to NASA times out, dispatch `gh workflow run acquire-history.yml`, then `gh run download RUN_ID -n nasa-history -D public/history`. Do not fabricate records. Run history tests and inspect five comparisons per case. Increment history version before releasing revised archive values; retain old version compatibility. SHA-256 files identify raw and normalized records. Re-run `node scripts/history-evidence.mjs` for human-readable comparisons.

## Deploy and rollback

Pages is configured to use GitHub Actions. Public repo: aibysid/space-weather-twin. Push main or dispatch deploy.yml. Deployment job alone has pages:write and id-token:write. Build jobs use contents:read; snapshot persistence alone has contents:write. Official action major versions are pinned in workflow files. Main deploy restores the current validated data-cache set, builds and deploys atomically. Pages concurrency serializes publication. A failed build cannot replace the last successful artifact.

Rollback: check out a prior validated tag locally, run checks, push a corrective source commit to main, or dispatch a workflow at the validated tag. Restore its history assets and preserve snapshot collection timestamps. Never relabel old cache as current. After deploy verify hash navigation and all anonymous feeds from a fresh browser.

## Schema change

Capture raw provider fixture; compare official notice; revise adapterVersion, normalization and quality tests. Preserve UTC basis, channel definitions and GSM semantics. Run checks, rebuild snapshots and validate production browser access. Record decisions. Missing units or changed timing disable derived outputs until resolved.

## Maintenance

Periodically inspect schema and dependency changes, schedules and Pages status. Manual snapshot dispatch requires repository Actions write access. Check `npm audit`. Review Pages free-tier limits (published site target 50 MB; initial app compressed 2 MB; initial data 8 MB). Reduce assets/polling or show user limits when growth threatens free limits; never enable billing automatically. No service worker, continuous history store or database.
