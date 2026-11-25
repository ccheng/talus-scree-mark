# PSA research R5–R8 (2026-11-25)

Research only; PSA self-evaluation, no independent tester, no app, PR #8 or preview changes. Owner authorized sequential R5–R8. Baseline source resolved to classroom branch head a5ff1545ff9b0328c7059d03333b3c11a4335bb6.

## R5: controlled glyph comparison
Identical normalized glyph patches; 4,800 training, 1,000 calibration, 2,000 reserve; disjoint font-directory groups (22/6/27 font files). Synthetic ellipse size, stroke, contrast, blur and localization jitter varied. Logistic and restricted template library trained on the same data, HOG+SVM and small CNN (six CPU epochs).
| Method | Calibration correct /1000 | Reserve correct /2000 | Previously examined private photo /160 |
|---|---:|---:|---:|
| Restricted template library | 534 | 918 | 106 |
| Logistic | 521 | 776 | 129 |
| HOG+SVM | 868 | 1360 | 141 |
| CNN | 722 | 1180 | 144 |

On reserve, SVM reported >=90% score for 796 glyphs, 33 wrong; CNN 469, 20 wrong. Neither score is demonstrated calibrated for real print. HOG+SVM selected for R6 based on calibration and synthetic generalization; not necessarily superior on physical forms. Restricted template library differs from Cycle 4's larger library. Sheet-adaptive classifier and isolated latency comparison not completed.

## R6: consolidated bounded engine
Reuse Cycle 5 geometry and independently verified structural factors, add SVM row-averaged log scores, best nonidentity permutation and repeated-row margin. Calibration on 20 synthetic regions (6 valid, 14 incompatible), reserve 30 (9 valid, 21 incompatible). Rule chosen on calibration only: SVM permutation margin >=0 and repeat margin >=-10, subject to structural gate. Strong observed axis/header or outer occupancy contradiction can reject; insufficient evidence routes to review.
Previous template gate accepted 6/9 valid and 1/21 incompatible on reserve. SVM accepted 5/9 valid and 0/21 incompatible, reviewed 4 valid and 12 incompatible, rejected 9 incompatible. Median desktop 0.612 s/region excluding model/template load. Not a grading accuracy result.

## R7: whole-page proposals
Candidate ellipses on entire page; decimal-pair anchors, nearby vertical pitch alternatives, affine lattice fit and duplicate suppression; send bounded proposals to R6. No manually supplied region. Initial run on five synthetic mixed pages: 7/9 valid NR grids accepted, 0/7 incompatible accepted, no proposals on MC-only page. Known private full-page photograph: zero candidates. Bounded correction raises working resolution, lowers proposal support threshold, samples original image for verification. Fresh five synthetic pages: 5/9 valid accepted, 0/7 incompatible accepted; prior template decision on same proposals 7/9 valid, 0/7 incompatible. Counts from distinct seeds, not paired improvement evidence. Known full-page photo: one of four NR regions proposed and accepted. R7 synthetic localization measures 40 digit centers against truth, not all 42. Main bottleneck is full-page candidate generation; do not confuse this result with 4/4 bounded-crop diagnostics.

## R8: actual classroom detector comparison
Fetched and executed nine actual JS source modules from pinned classroom commit in a JS isolate using a module adapter. Five deterministic 900x1200 grayscale pages with mixed MC, NR, WR lines; supplied exact page corners to app; experimental engine searches entire page without corners. Identical FNV-1a raster hashes verified in Python and JS: bf6bd7a5, 11c4953d, 7641a9a1, 87216045, 8f11a4a5. Mapping criterion all 42 expected centers within 5.25 px (one quarter vertical pitch); this is geometry, not independent digit identity or grade truth.
| Result | Existing app | Experimental R7/R6 |
|---|---:|---:|
| Valid grids correctly mapped | 7/9 | 9/9 |
| Valid mappings sent to author review | 7/9 | 9/9 |
| Incompatible grids proposed for review | 4/7 | 4/7 |
| Incompatible grids explicitly rejected by experimental model | not comparable | 2/7 |
| Incompatible grids not proposed by experimental model | not comparable | 1/7 |

Existing app returned proposed status on four incompatible NR layouts (swapped digits, repeated digits, extra decimal 43 choices, missing decimal 41 choices); these are authoring proposals, not automatically accepted grades. The experiment reviewed all valid grids and all four incompatible nonrejected proposed grids, and auto-accepted none. All five pages' raster hashes matched; actual source comparison accomplished. On one mixed-invalid page the app returned invalid-grids and no components; experimental engine preserved the valid region's mapping for review. App detected 18 MC items on each of the other four pages; experiment is NR-only. No claim of speed advantage: separate execution environments and workload. No direct app baseline on real photo, real-device test, independent holdout or representative physical captures.

## Disposition
Do not replace the current app detector. HOG/SVM evidence is useful but overly conservative under domain shift. Investigate independent header-first and digit-lattice candidate generators (not dependent on a decimal pair and abundant intact contours); preserve accurate reviewable mappings when semantic evidence is insufficient; distinguish contradictory vs absent evidence. Seek independent mock forms and annotated real captures, compare actual detector and experimental proposals, evaluate teacher correction burden. Owner archive includes runnable Python experiments, synthetic model weights, observed results, and a Node replay wrapper for actual baseline (wrapper itself unexecuted; connector source execution is observed). No private photograph, crop coordinates or photo-derived per-position data committed. No paid computation or merge.
