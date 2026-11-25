# Cycle 5: scale-relative lattice inference

PSA exploratory research, no app or preview changes. Reopened and executed code derived from Cycle 4. The new method resizes a manually bounded region to a working resolution, extracts candidate ellipses from adaptive and Otsu contours, estimates horizontal/vertical pitches from candidate-center differences, searches origin and pitch hypotheses against nearest contour centers, and fits an affine lattice to supported centers. A common ellipse size comes from median matched contour sizes, followed by common-scale ring filtering and local refinement in lattice-relative coordinates. This replaces the fixed radius search but is not unrestricted perspective/rotation or whole-page discovery.

Initial real-photo grid hypotheses were shifted by one row. A bounded correction adds independent writing-box bottom-edge evidence to the origin score. This restored the intended digit row on all four previously examined private photo regions. Box axis agreement remains a separate check. Decimal evidence permits a separate common relative size search, tests inner ring/dot support and outer ring absence. Glyph-only templates score all ten identities per row. The best nonidentity permutation is obtained exactly by forbidding each diagonal assignment in turn and solving the Hungarian assignment problem. The sequence score is the expected assignment minus the strongest competing permutation; it is a discriminative margin, not a probability.

## Evidence
Fresh synthetic generator: PIL ellipse/font rendering, variable horizontal/vertical spacing and ellipse size, rotation within three degrees, independent horizontal/vertical resizing, blur and contrast. Calibration 20 (6 valid, 14 incompatible), reserve 30 (9 valid, 21 incompatible). Same generator, disjoint seeds; not independent physical sheets. Structural thresholds inherited/adapted from prior diagnostics; permutation cutoff selected using calibration only (-0.12). Generator font path corrected before reserve. No app baseline.

| Model | Valid accepted /9 | Incompatible accepted /21 |
|---|---:|---:|
| Structural checks | 8 | 6 |
| Structure + permutation margin | 7 | 3 |

The maximum digit-center error over all nine valid reserve regions was 0.993 px in 170x310 normalized coordinates. All 15 geometric negative controls (missing row, shifted column/header, extra outer ring, missing decimal) were declined. Two of three swapped-row and one of three repeated-digit regions still passed the combined gate. Median measured desktop processing 0.646 s per region, excluding font-template generation. No browser or iPhone timing.

All four original private photograph regions passed the corrected combined gate. All 12 resized versions (three transformations per region) passed; maximum displacement relative to the original detector outputs was 1.47 normalized px for digit centers and 0.92 for decimals (repeatability, not localization truth). These are correlated resamplings, not 12 physical captures. All five previously exposed photo-derived negative controls now declined, including swapped 0/1 rows. No private data committed.

Replayed Cycle 4's seven exposed synthetic smoke controls: rejected all four incompatible controls, but accepted only one of the three valid forms. The accepted valid form had max digit-center error 4.79 normalized px, versus 4.92 and 4.47 for the two declined forms. Thus the earlier small-bubble family remains unresolved; no general replacement is established.

## Disposition
Geometry is promising for variable-scale near-upright bounded regions but remains limited by candidate generation, header priors, and glyph-domain mismatch. The best next research is a stronger print-digit classifier with synthetic fonts rasterized at measured bubble proportions, explicit abstention for semantic contradictions/uncertainty, and direct comparison against the actual application detector on independent mock forms. Need independently annotated 42-position localization and physical-capture evidence. Do not integrate or claim production readiness. Full code and results supplied separately to owner; no private photo images, private crop coordinates or private diagnostic vectors committed. No paid computation.
