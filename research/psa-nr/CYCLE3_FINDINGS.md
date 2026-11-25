# PSA cycle 3: independently inferred header, explicit decimal absence, and within-grid glyph similarity

Research only; no app integration or change to PR #8/previews. PSA self-evaluation, not independent tester evidence. Source classifiers frozen from earlier cycles. All datasets share a synthetic generator and restricted normalized 170x310 crop/pose. Fit 60, calibration 60, test 120 (36 valid, 84 incompatible); distinct seeds and font groups; six test samples per kind. Compare candidate models using the cycle 2 feature set refitted on this dataset. Valid acceptance uses mean digit-center error <4 pixels, and all accepted valid grids also met max digit-center error <4 pixels. Decimal localization and exact 42-position mapping not measured.

New factors:
- Independently search four writing-box axes from horizontal line pairs and vertical edge projections in the top region; compare inferred axes and bottom edge with independently proposed digit lattice.
- Explicit decimal occupancy [0,1,1,0]: sector-based circular outline evidence, central dot evidence, local ink, and absolute outer-ring evidence distinct from middle-to-outer contrast. Include extra outer dot bubble, empty outer ring, both extra outer bubbles, and valid noncircular outer text/stroke controls.
- Within-grid glyph similarity: central masked glyph features, same-row versus other-row similarity, nearest alternative margin. Repeated-digit and one-column inconsistent-digit controls.
- Logistic lattice-level discriminative fusion; these are not calibrated Bayesian posteriors or independent physical observations.

Initial test:
| Model | Valid accepted /36 | Wrong accepted /84 |
|---|---:|---:|
| Cycle 2 full | 26 | 13 |
| + independent header | 29 | 6 |
| + explicit occupancy | 28 | 17 |
| + glyph similarity | 26 | 7 |
| all three + logistic and CNN | 30 | 6 |
| all three, no pretrained digit models | 30 | 18 |
| all three + logistic digits only | 30 | 3 |

Explicit occupancy model alone rejected all 18 extra-outer controls, but increased other false accepts. The independent header model reduced shifted-box accepts from 3/6 to 0/6 and improved faint-header acceptance from 2/6 to 6/6. Logistic-only full model rejected all 18 extra-outer controls and all shifted-header cases, accepted all six outer-text cases, and had three false accepts (one each missing decimal, repeated digits and inconsistent digits). All models declined four approximate crops from the private blank photograph.

## Bounded correction and fresh reserve
Added central glyph centroid/spread normalization, leave-one-column-out row prototypes, Hungarian assignment comparison with expected row matching, and prototype distinctness scores. Added a separately calibrated noncompensatory decimal guard: minimum middle dot-plus-ring evidence and maximum outer circular evidence must both pass before automatic acceptance. Fresh seeds, same split sizes and font groups; refit prior comparator on fresh fit/calibration only.
| Model | Valid /36 | Wrong /84 |
|---|---:|---:|
| Prior logistic full refit | 29 | 8 |
| Prior logistic full + occupancy guard | 28 | 6 |
| Normalized glyph + logistic | 26 | 2 |
| Normalized glyph + logistic + occupancy guard | 26 | 2 |
| Normalized glyph, no pretrained digits | 29 | 17 |
| Normalized glyph, no pretrained digits + guard | 28 | 13 |

Guard thresholds selected on calibration: inner minimum .04, outer maximum .008 (normalized experimental scores, not production thresholds). Guard removed the two empty outer-ring false accepts in the prior comparator. Corrected full model rejected all 18 extra-outer controls and all six inconsistent-digit controls, but accepted 2/6 repeated-digit grids and missed 10/36 valid grids. No accepted valid grid exceeded 4 px maximum digit-center error. All three corrected variants, with and without guards, declined all four private photo crops. Do not tune against that photo. No actual app baseline, independent holdout, iPhone timing, or complete probabilistic factor graph implemented.

## Disposition
Independent header inference and explicit outer absence are useful on synthetic controls. Glyph similarity helps detect inconsistent columns but cannot establish absolute digit order: consistently permuted or repeated rows may still be internally similar. No benefit from CNN established. Real-print domain transfer remains unresolved. Next: use independently generated physical/mock forms, measure digit patch failure and geometry separately, include scale/pose and print styles with adequate diversity, compare against actual detector, measure exact 42-position mappings and runtime. Prefer a distinct uncertainty/review state over inventing missing evidence. No integration justified.

Owner receives full runnable cycle 3 archive separately; no private images, holdout data, or private crop coordinates added to repository. No paid computation.
