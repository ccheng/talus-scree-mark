# R15–R16 native raster prototype (follow-up to README)

Research-only experimental authoring discovery. The earlier README describes component equivalence before this follow-up. `pixels.mjs`, `hog.mjs`, and `verifier.mjs` now provide a native JavaScript grayscale-raster-to-proposal path without OpenCV.js. `geometry.mjs` and `svm.mjs` remain the shared geometric and classification components. Input: bounded uint8 grayscale working raster (32–2400 pixels per side), plus verified numeric SVM weights. Image decoding, resizing to the working raster, browser asset loading, worker scheduling, cancellation, privacy review and authoring UI integration are not provided. No app code or grading changed.

## Reproduce

First run the training/export steps in README. Then from this directory:

```
python hog_fixtures.py
node hog_check.mjs
python native_fixtures.py regenerated-svm.pkl
node native_check.mjs
```

`native_fixtures.py` generates four new public development pages and executes the Python reference on identical pixels. `--photo` optionally adds a local user-provided photo, resized to a common working raster; use a private output directory and never publish raw images, manifest or coordinates. Tests produce local metrics, not independent release evidence. Synthetic fixture data/model binaries are intentionally regenerated, not committed. No real assessment imagery or sealed holdout data in source.

## Observed results

- HOG: 200 synthetic glyphs, native JS versus OpenCV descriptors; maximum absolute feature difference 0.000397, mean absolute difference 0.0000151; maximum predicted-probability difference 0.000338; all 200 argmax predictions agree.
- Shared raster comparison: seven valid regions and five incompatible regions across four synthetic pages. Each implementation mapped all seven valid regions within one-quarter grid pitch at all 42 positions. Python confirms five and reviews two; native JS confirms six and reviews one. Neither confirms an incompatible region. MC-only page has zero proposals in both. Native JS omitted one incompatible proposal that Python rejected. Maximum normalized localization error over valid mappings: Python 0.0481, JS 0.0495. These are development fixtures, not independent holdouts.
- Known previously examined Physics photograph: four writing-box groups, four native proposals, four confirmed; Python also confirms four. No private coordinates in source, no claim of generalization to unseen forms or completed sheets. Native raster scan on desktop Node took about 1.69–2.85 s on synthetic pages, 4.59 s on common resized photo, excluding loading. Not an iPhone timing.

## Limitations / next gate

Native contour, interpolation, morphology, crop normalization and HOG approximate OpenCV operations; final decisions and intermediate coordinates are not identical. Native JS does not reproduce every Python diagnostic (notably template diagnostics). It is a feasible port, not a fully equivalent release candidate. Need independent mock-form/physical capture validation, compare against actual app detector, investigate decision disagreement, stronger perspective and unboxed forms, enforce review for uncertainty and resource bounds, and test on Safari before integration. Preserve Python reference and existing app detector. No release or merge approval implied.
