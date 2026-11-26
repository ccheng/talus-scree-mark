# R15–R16 native raster prototype and bounded worker

Research-only authoring discovery. Earlier README describes component equivalence before this follow-up. `pixels.mjs`, `hog.mjs`, and `verifier.mjs` now provide a native JavaScript grayscale-raster-to-proposal pipeline, without Python, OpenCV.js, or external inference at runtime. `geometry.mjs` and `svm.mjs` provide geometry and semantic evidence. No app code, deployment, PR #8, or grading changes. Input is a bounded grayscale uint8 working raster (32–2400 px per side, <=4 million pixels). Accept means a research authoring proposal, never authorization to grade.

## Reproduce

From this directory, follow README to regenerate the exact synthetic model and export its numeric weights. Then:

```
python hog_fixtures.py
node hog_check.mjs
python native_fixtures.py regenerated-svm.pkl
node native_check.mjs native-fixtures/manifest.json
node node_worker_check.mjs native-fixtures/manifest.json
```

`native_fixtures.py` generates four public development pages and runs the frozen Python reference on identical pixels. Optional `--photo` is for private local diagnostics only; do not publish the generated raster, manifest or coordinates. `stress_prep.py PHOTO OUTDIR` and `node stress_check.mjs OUTDIR/manifest.json` test correlated image transformations privately. Generated models, images and numeric results remain local. No sealed holdout or real student data committed.

`worker.mjs` and `worker-client.mjs` demonstrate single-flight model loading, pinned binary SHA-256 and metadata verification, transferable image buffers, cancellation by terminating the worker, timeout and recovery by reinitialization. Image decoding, resizing, worker asset packaging, browser/PWA caching, application UI and review/confirmation integration remain external responsibilities. `node-worker-adapter.mjs` is only a Node test shim. `worker_check.py` is a Chromium smoke test (requires Playwright and Chromium); local HTTP navigation was blocked by administrator policy, so the browser test was **not completed**. Node worker tests do not establish browser compatibility.

## Observed results

- Native HOG: 200 synthetic glyphs, maximum absolute feature difference 0.000397 versus OpenCV; mean absolute difference 0.0000151; maximum predicted probability difference 0.000338; all 200 argmax predictions agree.
- Identical synthetic rasters: 7 valid, 5 incompatible regions across 4 pages. Both Python and JS map 7/7 valid regions (all 42 positions within quarter-min-pitch). Python confirms 5 and reviews 2; native JS confirms 6 and reviews 1. Neither confirms an incompatible region. MC-only page yields no proposals in both. Native JS omits one incompatible proposal rejected by Python. Max normalized valid localization error Python 0.0481, JS 0.0495. Replayed after resource safeguards with same results.
- Known private Physics blank photo: both implementations confirm 4/4. Native JS also confirms 4/4 at half resolution, 4/4 under 5-degree rotation, 4/4 under a mild synthetic perspective warp, 1/4 under a stronger perspective warp. Correlated resampling, not independent captures or annotated physical localization. No tuning to the last stress failure. Blank raster zero proposals.
- Desktop Node replay: ~1.55–2.91 seconds per synthetic page, 4.70 s on resized private photo, excluding model load. Previous six-page stress run observed process RSS as high as 304 MiB; later run with reused connected-component workspace saw end-of-page RSS up to 263 MiB. These measurements are not controlled peak-memory comparisons and not Safari measurements.
- Resource safeguards: raw/retained candidate caps, raster size bounds, shape plausibility, unique outline association, deterministic nearest-distance evaluation budget (180M checks default; known private cases up to 146M). Budget exhaustion returns review with an explicit reason and no partial proposal. This is not a hard wall-clock guarantee. Worker client terminates timed-out or cancelled scans.
- Node worker tests: corrupt model bytes, inconsistent model metadata, cancellation, timeout, invalid raster and forced search-budget exhaustion pass. All 4 synthetic worker outputs are deeply equal to direct Node results. No browser/iPhone test passed or claimed.

## Remaining gates

Native image extraction and glyph normalization approximate OpenCV, so this is functional rather than strict equivalence. One valid decision differs; no independent validation shows that either decision is preferable. Needs independently prepared forms and captures, stronger perspective handling (prefer existing page rectification plus local verification), existing app comparison on those forms, Safari memory/timing and offline worker asset validation. The ~8 MiB float64 weights and search cost warrant further engineering evaluation. Preserve teacher review, inferred positions and existing app detector. No app integration or merge authorized by these research results.
