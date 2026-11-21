# Quality gate

The Coordinator submits each milestone with a candidate SHA, intended criteria, acceptance evidence, any known failures and a recommended disposition. The Product Owner decides acceptance and merge. See [AGENTS.md](AGENTS.md) for the one-cycle workflow.

| Evidence tier | How to verify | Where it applies |
| --- | --- | --- |
| Foundation and pure logic | Fresh-checkout `npm test`, document/fixture inspection and deterministic input/output oracles | Repository conventions, schema, raw recognition/correction separation and grading logic when present |
| Desktop browser | Reproducible localhost or HTTPS setup, project-subpath checks, automated browser tests when useful | Manifest and worker scope, cache/update failure injection, persistence and attempted-request interception |
| Real iPhone | Named model, iOS version and build, Safari and installed Home Screen, authorized HTTPS origin and deliberate airplane mode | Camera/lifecycle, storage, field capture quality, responsiveness and local export |
| Research benchmark | Frozen candidate and Evaluation-owned holdout with documented thresholds and group-level uncertainty | Recognition performance and safe rejection, separate from deterministic functional checks |

The Independent Tester designs inputs and expected outcomes before relying on Developer evidence. Test the exact candidate content and record SHA and environment, commands, fixture IDs, expected and actual, status (pass, fail or not run) and sanitized evidence. Distinguish simulated, desktop-browser and device tests. GitHub Pages base-path testing must use `/talus-scree-mark/`; root-only success provides no subpath evidence. An iPhone needs an authorized HTTPS test route. Desktop WebKit and phone viewport emulation do not establish iPhone behavior.

## Fixtures and defects

Use deterministic seeds, generator versions, stable fixture and template IDs, partition/capture group IDs, and explicit ground truth. For image suites include page corners, orientation, profile and region coordinates, mark state and literal NR cells, handwriting truth when relevant, and expected grade/review behavior. Label procedural perturbations and physical print-and-capture conditions separately. Group derivatives and recaptures with their original. Keep holdouts outside the public repo.

Log a defect with ID, severity, criterion, SHA, environment, fixture/configuration, reproduction steps, expected and actual, impact, sanitized evidence, status and regression/fix SHA. For the bounded retest, reproduce the original issue and verify adjacent behavior, recording unresolved results. Use synthetic analogues for published recognition regressions and reserve holdout assets for genuine independent confirmation.

## Real-device and privacy checks

- Exercise rear-camera selection, permission denial and recovery, interruption/backgrounding, portrait and landscape, image import and supported formats including observed EXIF/HEIC behavior, blur, glare, skew and clipped regions.
- Cold-launch offline after complete cache and test denied/interrupted installation, interrupted update, previous compatible shell, missing optional CNN, reopening data and local CSV/JSON export. Record injected quota/eviction separately from actual observed OS behavior.
- Use request interception or equivalent observation while online as well as offline to detect attempted requests during camera/import, recognition, review, grading, storage and export. Inspect URL, payload, logs, caches, storage and export with synthetic inputs. Restrict expected network activity to explicit static resource delivery and updates.
- Record reference device, iOS build, Safari/PWA mode, cold/warm timings, interruptions and test date. Treat unperformed physical checks as open release gates where required.
