# PSA recognition research: first bounded cycle (2026-11-25)

Status: exploratory; not an application candidate. Base ffde465d78096b14d86c95e69dd12c6e253c36c0. No production code, PR #8, preview, or deployment changes. The Product Owner authorized R1–R4 investigation under Mini-Charter v4. This is PSA self-evaluation, not independent evaluator evidence.

## R1 and partial R4: grid hypothesis with ordered-digit factors

In a bounded approximately cropped region, search a latent axis-aligned 4-by-10 lattice over origin and horizontal/vertical pitch. Pool soft local ring-contrast evidence at 40 predicted centers. Generate multiple candidate lattices. Score each using mean log predicted probability of the expected row digit and a weakest-row ring-evidence gate. Compare against ring-only pooling. This is a restricted factorized scoring model, not a calibrated Bayesian posterior or general message-passing implementation. No writing-box or decimal-bubble factors, full-page discovery, rotation or perspective estimation. Negative controls comprise empty circles, shifted digit order, nine rows, a missing interior row, and scattered circles.

Initial evaluation: synthetic patch training on three font faces; separately generated calibration and holdout with different font faces; all share the same generator, so results are not independent physical-sheet or writer evidence. Select gates on calibration only. The geometry-only prototype accepted 30/30 complete valid grids and 40/50 incompatible grids. The combined logistic-digit/geometry model accepted 27/30 valid and 0/50 incompatible. Three faint valid grids declined. A local diagnostic on four manually cropped regions of a private real blank sheet rejected all four with the combined model. No private images, locations, answers or benchmark fixtures are committed.

One bounded correction: a small CPU convolutional net with a shared visual backbone, blank-digit and mark-state heads, additional scale/shift perturbation, 3,000 generated patches, four epochs. The larger run exceeded the execution limit; smaller run completed. Fresh reserve generation and calibration yielded:
 
| Model | Valid accepted | Wrong accepted |
| --- | ---: | ---: |
| Ring-only | 33/36 | 48/60 |
| Ring + logistic ordered-digit model | 32/36 | 0/60 |
| Ring + CNN ordered-digit model | 36/36 | 15/60 |

CNN accepted all 12 wrong-digit grids and three empty-circle grids. No evidence warrants replacing the logistic semantic gate with this CNN. Reserve CNN private-photo diagnostic not completed. Neither approach was compared directly with the current application detector; no claim of production improvement.

## R2: patch mark classification

First holdout contains 8,000 synthetic digit patches across 800 columns. Confusion matrices (rows actual, columns predicted; classes blank, strong, weak/erased):
 
Darkness baseline: [[7010,30,0],[190,450,0],[307,13,0]].
Logistic visual features: [[5486,94,1460],[17,567,56],[71,27,222]].

Learned evidence improves strong and weak recognition but creates many false uncertain states and additional false marked blanks. Synthetic weak/erased strokes are a simplification, not a physical-pencil validation.

Fresh reserve patch matrices:
Logistic [[5246,186,1608],[9,571,60],[50,35,235]].
Small CNN [[5671,82,1287],[4,587,49],[135,20,165]].
The small CNN improves some blank/strong outcomes but misses more weak marks. No safe model replacement demonstrated.

## R3: structured response inference

Initial exact binary pattern enumeration (1024 patterns) with blank/single/multiple priors and explicit uncertainty guards: 4 correct automatic columns, 1 wrong automatic column, 795 review out of 800. Independent per-cell threshold policy: 18 correct automatic, 4 wrong automatic, 778 review. Neither is useful. Priors must never suppress credible double or weak marks.

Correction: explicit three-state event marginalization without forcing a single digit. Given per-cell p(blank), p(strong), p(uncertain), P(blank column) = product p(blank); P(single i) = p(strong_i) times product of other p(blank); remaining probability belongs to review. This assumes conditional independence; not a calibrated real-world posterior. On fresh 800-column reserve, conservative calibration chose all-review for both logistic policies and CNN exact-event policy. CNN independent policy auto-accepted 6 correct, 3 wrong, reviewed 791. These are column counts, not whole four-column NR answers. No answer key used during inference.

## Disposition

R1 promising specifically as structural verification through ordered-digit semantic evidence; not yet usable on the physical photo. R2/R3 inconclusive for grading, with unacceptable coverage and/or unsafe acceptance. R4 limited to joint candidate scoring with geometric and semantic evidence; full joint geometry/mark-state inference remains untested. Small synthetic splits and shared generator limit external validity. No independent test agent, physical iPhone evaluation, app detector comparison, or browser runtime measurement was performed. No paid services. Full runnable exploratory scripts and detailed results retained outside the repository for the Product Owner, consistent with the repository's holdout/privacy policy.

Next: independent consulting research should develop robust print-digit features and a real/mock-paper evaluation protocol, add box/decimal and explicit non-NR hypotheses, compare against the actual detector on frozen source and separately held-out forms, and calibrate selective coverage. Test local visual evidence before introducing more elaborate graphical inference. Keep recognition changes isolated pending independently demonstrated benefit. No merges authorized.
