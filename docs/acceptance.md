# Release acceptance evidence

Evidence collected 2026-10-10 UTC. Adapter noaa-v1, OMNI adapter omni-v1, dataset version 1.0.0. Unit fixtures and recorded provider responses are separate from real-service checks. NASA acquisition ran successfully on GitHub Actions run 38058036848. Source JSON and raw SHA-256 accompany every historical case.

| Gate | Evidence and result |
|---|---|
| A01 | HashRouter, project base, refresh/back browser tests; deployed production refresh/back check passed; production-integration.json. |
| A02 | All eight current object feeds returned HTTP 200; integration.json fields and CORS headers; legacy URLs absent from source. |
| A03 | Unit tests require boolean active, source switches, ambiguity rejection. |
| A04 | GSE-only fixture yields unavailable GSM Bz. |
| A05 | Independent known answer 1.33808 nPa; doubled speed 5.35232 nPa. |
| A06 | Independent proxy 2 and northward 0; 90 s matching, earlier tie and cursor cutoff. |
| A07 | 3750 s at 400 km/s; bowShockShifted disables transport. |
| A08 | 149597.8707 s hypothetical one-AU duration. |
| A09 | Long-channel X-ray and ≥10 MeV proton selection, both contamination spellings; log zero rejected. |
| A10 | Branch 0 only; null and 0 stay distinct. |
| A11 | Recorded provider forecast fixture/status inventory; allowlist tests; Kp casing distinct; index labeled three-hour. |
| A12 | 120/120/48 real NASA rows; all records independently compared to raw parameters, hashes checked. Five spot comparisons per case in history-validation.json. |
| A13 | Numeric/string metadata fills mapped null; half-hour tags preserved; source bow-shock basis retained. |
| A14 | Browser replay start/end, reset/play and keyboard scrubbing; data selector tests cover gaps and past-only. |
| A15 | Browser historical mode shows unavailable GOES, scales, aurora. |
| A16 | Seam conflict/normalization, both poles and missing-cell lookup unit fixtures. Five raw cells including seam/north/south agree (aurora-validation.json); independent equinox, opposite longitude and polar checks pass. |
| A17 | Separate observation/valid times and expiry logic; solar altitude day/night tests for equinox/opposite longitude/polar season. |
| A18 | Browser unsaved edits leave baseline; apply/export verifies new pressure; observations never mutated. |
| A19 | Initial anonymous Node integration all 8 HTTP 200 with wildcard CORS; all eight returned HTTP 200/CORS from deployed Pages origin in production-integration.json. |
| A20 | Unit HTTP404/malformed/oversize/empty/schema/cache checks; browser HTTP429 snapshot recovery; timeout/schema/empty/quality categories and Retry-After pass independent tests even when fallback fails. |
| A21 | Original snapshot retrieval retained under network failure; UI transport and age labels. |
| A22 | Unit hidden scheduler, due-only and overlap checks; visibility handler suspends polling/replay. |
| A23 | SVG usable without WebGL; context-loss handler swaps renderer; manual choice available. |
| A24 | Browser overflow assertions for every route at 360/768/1280/1440. |
| A25 | Axe serious/critical zero across tested routes/widths; keyboard cursor, replay, tablet drawer focus/Escape. Automated evidence does not replace human assistive-technology certification. |
| A26 | Reduced-motion preference starts static SVG; replay remains independent. |
| A27 | Browser JSON verifies full calculation/input precision; CSV quote/formula tests; provenance and method versions included. |
| A28 | Browser PNG export header signature verified; metadata legend/mode/times drawn; WebGL fresh frame uses no persistent drawing buffer. |
| A29 | Bounded share tests and old recent URL explicitly unavailable; historical version mismatch requires case selection. |
| A30 | Geolocation only from clicked control; permission refusal message; preferences-only localStorage. |
| A31 | Compressed build budgets measured; initial scene lazy; real physical mobile device FPS/10 Mbps certification remains outside automated desktop emulation. |
| A32 | Atomic per-feed snapshot script retains previous valid files, data-cache persistence, serialized full Pages deployments; manual snapshot run 38070327350 successfully acquired, persisted and deployed all eight feeds. |
| A33 | Exact lockfile; lint/typecheck/unit/E2E/build; history --from-raw deterministic; clean GitHub runner checks. |
| A34 | Credential-free APIs, no tracking or paid service, explicit science labels; npm audit zero at verification. |
| A35 | README, methods, architecture, runbook, decisions, attribution and license inventory. |
| A36 | Public Pages deployments passed (38059015388, 38070301753); fresh Chromium production session verifies every feed and route; screenshots in docs/screenshots. |

## Check outputs

31 deterministic tests pass; ten fixture-driven Chromium browser flows pass. Lint and strict typecheck pass. Dependency audit has zero reported vulnerabilities. Axe has no serious/critical findings across five routes at 360/768/1280/1440 px. Cross-browser smoke passed all routes in Chromium, Firefox and WebKit (cross-browser.json). These browsers are Playwright engines, not a claim that physical Safari/iOS/Android devices were used. Build budget: approximately 0.22 MB initial compressed app, 0.24 MB lazy scene and 7.2 MB complete published files.

The source is a release candidate until the manual certifications below are completed. Automated and production integration work is complete; A25/A31 manual evidence is explicitly open. No acceptance gate is silently waived.

## Verification limits

Physical iOS/Android devices and a human screen-reader session are not available in this build environment. Desktop browser/emulation and automated accessibility results must not be represented as those manual certifications. NOAA flag semantics beyond the documented active/source contract remain a conservative eligibility policy, disclosed in the methodology and decision log. Network/provider availability is not guaranteed.
