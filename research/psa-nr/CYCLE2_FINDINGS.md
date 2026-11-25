# PSA cycle 2: classifier fusion and complete NR structural evidence

Product Owner authorized a further bounded research cycle on logistic + CNN fusion, writing boxes, decimal bubbles and column axes. Research only, no app changes or merge. Self-evaluation, not independent verification. Both datasets use a common synthetic generator; no current application baseline comparison. Initial cycle 2 used 56 fit, 56 calibration and 112 test regions, with 40 valid and 72 incompatible test regions. Separate font groups and random seeds; same form grammar. Prior patch classifiers frozen. Four candidate lattices from ring search; candidate-level logistic scoring and calibration. Valid acceptance requires mean digit-center error <4 pixels on a normalized 170x310 region; this is not exact 42-position mapping.

Factors: expected digit log score versus competing shifted sequences and empty circles; equal-weight probability pooling or learned stacking of logistic/CNN scores; aligned versus displaced writing-box edges (joined or separated); evidence for middle-column decimal rings compared with outer columns; local column coherence. Scores are discriminative potentials, not calibrated Bayesian posteriors.

| Model | Valid accepted /40 | Wrong accepted /72 | Bad localization accepted |
|---|---:|---:|---:|
| Geometry | 0 | 1 | 0 |
| Logistic | 35 | 31 | 0 |
| CNN | 29 | 27 | 3 |
| Equal ensemble | 36 | 33 | 1 |
| Stacked classifiers | 36 | 31 | 0 |
| Structural factors | 30 | 23 | 0 |
| Stacked + structural factors | 33 | 15 | 0 |

Geometry comparator became excessively conservative, not an app baseline. Initial full model rejected all wrong-digit and wrong-decimal controls but accepted 7/8 shifted columns, 4/8 missing decimals and 2/8 missing rows. The four private photo regions were all declined by the combined model; structure-only and CNN each accepted four. This is a diagnostic only, not an independently annotated benchmark.

## Bounded correction

Added independent per-column horizontal displacement search (aligned evidence versus displaced alternatives), weakest-row support relative to median, and decimal dot-plus-ring evidence. Fresh fit/calibration/test generation with separate seeds, same counts and font protocol.

| Model | Valid accepted /40 | Wrong accepted /72 | Bad localization accepted |
|---|---:|---:|---:|
| Prior feature set refitted | 31 | 28 | 0 |
| Corrected full | 30 | 11 | 0 |
| Corrected structure only | 29 | 17 | 0 |
| Corrected logistic + structure | 31 | 12 | 0 |

Full correction reduced false accepts by 17/28 (60.7%) with one fewer valid acceptance. Shifted-column false accepts dropped 8 to 1, missing-decimal 4 to 1, missing-row 4 to 1. Shifted boxes remained 7/8; wrong digits with correct header went from 0 to 1. CNN adds no convincing benefit over corrected logistic + structure: one fewer false acceptance and one fewer valid acceptance. A guarded decision requiring the same candidate to pass both full and structural model scored 28 valid accepts, 3 valid reviews, 9 valid declines; 10 incompatible accepts, 8 incompatible reviews, 54 incompatible declines, zero accepted bad localization under the stated proxy. All four private photo crops still declined, including the guarded model. No deployment recommendation.

## Disposition

Do not tune further against exposed test sets or a single physical photo. Next research should independently detect the four writing-box centers/edges and compare their fitted axes with a separately inferred digit grid; explicitly test shifted-header alternative rather than relying on a single aggregate fit. Investigate glyph scale, aspect, contrast and outline removal; consider synthetic-to-physical transfer via independently prepared mock sheets. Use a tri-state hypothesis (confirmed, uncertain/review, incompatible) and independent evaluation; compare against actual app detector and report exact 42-position mapping and runtime. More elaborate graphical inference is premature until local visual likelihoods transfer to print. Current full graph not implemented; this is lattice-level discriminative evidence fusion. No paid computation, real student data, app code, preview, or PR #8 changes.

Runnable experiment code, synthetic models, results and reproduction instructions supplied in the owner's separate cycle 2 archive. Do not publish exposed holdout feature matrices or private photo details to repository. No independently administered evaluation or physical-device timings.
