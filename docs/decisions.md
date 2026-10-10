# Implementation decisions and provider caveats

2026-10-10: Use Node 24 LTS for current dependency compatibility. Versions are exact in package-lock.json; npm audit is part of verification.

2026-10-10: Default scene renderer is lazy WebGL; reduced-motion users receive SVG by default. Rendering errors and context loss use SVG while preserving the full data interface. Scene particle speed is illustrative: 0.4 + min(speed, 2000)/1000 scene units per second. Fixed explanatory envelope in observation modes; pressure scaling only in Scenario.

2026-10-10: Local connection to NASA HAPI timed out; GitHub runner acquired all required windows. Committed raw responses allow deterministic offline regeneration. Metadata numeric fill strings are compared numerically before Kp/10 transformation.

2026-10-10: NOAA's official migration notice confirms active/source semantics and object Kp contracts. overall_quality=0 remains a conservative product eligibility policy; the public notice does not document every flag's physical interpretation. Missing/nonzero quality is rejected, and raw flags are retained. No claim that this filter establishes operational certification.

2026-10-10: Current NOAA Kp forecast status strings and recorded raw schemas are preserved in docs/integration.json and tests/fixtures. Provider values are not reconstructed from flux readings.

2026-10-10: Cache snapshots persist only on data-cache. Source fixtures are immutable integration test samples. Each scheduled cache update starts a new orphan commit to bound branch history. Source deploy and snapshot deploy share a non-cancelling publication concurrency group.
