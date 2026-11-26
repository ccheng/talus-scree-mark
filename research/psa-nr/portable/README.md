# R13–R16: portable Alberta NR research reference

Research only. Not production, not a grading engine, not a complete raster-to-result JavaScript implementation. The stable app, PR #8 and previews are untouched. User authorized isolated research. All evaluation is PSA self-evaluation; independent verification remains required.

## Source layout

- `nr_reference.py`: consolidated R12 two-path reference from grayscale uint8 image to NR authoring proposals, using writing-box and decimal candidates. Optional lattice path retained. No private photo coordinates or input data. `Reference(svm).discover(gray)` returns positions in input-image coordinates, evidence and accept/review/reject decisions. “Accept” means an experimental authoring proposal, not approval to grade.
- `train_svm.py`: reproduce the frozen SVM from 4,800 generated synthetic patches, no photo data. `export_model.py`: export non-executable little-endian float64 model plus metadata and SHA-256.
- `geometry.mjs`: native JS grouping of detected rectangles, header-seed search, discrete shifts/pitch perturbations, affine fitting, decimal proposals, merge and decision gates. Input is *already extracted* numeric ellipse candidates and box rectangles; it is not an image detector.
- `svm.mjs`: native JS SVM probabilities from precomputed 324-dimensional OpenCV HOG features, including multiclass probability coupling and exact alternative digit-row assignment. No HOG calculation or image processing in this file.
- `dev_fixtures.py`, `dev_check.py`, `equivalence.mjs`, `svm_check.mjs`: new public development smoke fixtures; not a sealed holdout. Numeric generated files and serialized model are deliberately not committed. No private captures, private coordinates or historical holdout features are published.

## Reproduce

Python 3.13.5, Node 22.16.0; pinned Python dependencies in requirements.txt. Install system font families in the same inventory at `/usr/share/fonts/truetype`; changes in font rasterization, version or installed faces may change results. Training uses 22 selected TTF files, development glyph test uses the specified font directories. The reference template diagnostics also use the system-wide regular fonts. Do not assume identical results with a different font inventory.

```
python -m pip install -r requirements.txt
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python train_svm.py regenerated-svm.pkl
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python dev_check.py regenerated-svm.pkl
node equivalence.mjs
node svm_check.mjs
```

`dev_check.py` exports the plain numeric model and synthetic feature fixtures locally. Do not load untrusted pickle files. Use the local training command to create the model. Numeric weights are synthetic and reproducible, but the JS runtime must verify their SHA-256 before use. Runtime asset loading, browser worker, size/latency limits and cancellation are not implemented. This standalone experiment has no network calls or application writes.

## Observed results

Consolidated Python reference exactly equaled the original R12 output on four synthetic pages and the previously examined private Physics photo (4/4 proposals accepted); separately executed runs, not independent evidence. Regenerated SVM: support vectors, dual coefficients, intercepts, probability A/B, per-class support counts, classes and gamma all exactly equal to archived model in the current environment. Numeric model SHA-256 d70778fe1dbea80e1219ff559dd4a5171c884655e80ab44c1b7cbb56e41149c3.

Public development test: 7/7 valid mapped within quarter-min-pitch tolerance at all 42 positions, 5 accepted, 2 review, zero incompatible accepted; four pages, five incompatible regions. JS on the *same extracted features* matched all 11 header groups, 10 header proposals, 10 decimal proposals, 12 merged proposals and 12 decisions. Max proposal center difference 1.48e-12 px. On 100 synthetic HOG descriptors, all argmax decisions matched; max probability difference 6.63e-14, max sequence-evidence difference 1.21e-13. These are component equivalence checks, not image-to-result equivalence or accuracy claims. Source-level timing in Node on this host is not iPhone performance. Numeric model ~8 MiB raw float64 (3,129 support vectors, 324 features), not final browser payload.

## Remaining work

Port/verify pixel extraction and bounded-region re-localization, shape maps, normalization, HOG feature extraction, and template diagnostics; OpenCV.js/WASM availability and payload need actual browser verification. No installed OpenCV.js runtime in this execution environment and no direct Git/network access from container. Do not infer exact HOG or contour equivalence from JS geometry/SVM tests. Full end-to-end cross-language equivalence, physical independent mock captures, perspective robustness, Safari runtime, and integration safeguards remain open. Existing app detector remains intact. Preserve all uncertain or inferred positions and teacher review, not force acceptance.
