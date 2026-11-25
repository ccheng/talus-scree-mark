# Cycle 4: physical-photo diagnostic (2026-11-25)

Product Owner designated real-photo transfer as primary research priority. Reopened Cycle 3 archive and original privately held blank photograph. This is debugging on previously exposed data, not independent verification. No private image, coordinates, models trained on private data, or private diagnostic vectors committed. No changes to app, PR #8, or previews.

## Diagnosis
Earlier normalized synthetic digit grids used approximately circular bubbles with diameters 12–16 px; the first real normalized crop has outlines approximately 23–24 px wide and 18–20 px high. The prior ring proposal searches circular radii 5.5–8.5 px, and its 23x23 fixed patch may clip outlines. On all four real crops, adaptive ellipse search selected semiaxes (11,9) and corrected the lattice origin by several pixels relative to the prior top ring-only proposal. Local refinement and visual inspection showed plausible alignment of 160 digit positions and eight decimal positions, but no independent pixel annotations were collected.

Frozen logistic printed-digit classifier diagnostic on 160 printed digits: original ring-only top proposal centers 16/160 exact; corrected centers 89/160; corrected centers with ellipse-to-circle patch normalization 83/160. Expected sequence relative to competing cyclic offsets improved markedly. A separate glyph-only template matcher masks the outer ring and normalizes glyph bounding box; uses generic local installed font templates (237 font paths, 21,330 templates), no photo training. Exact digit identities 145/160, mostly digit 1 errors. These are printed digits, not student marks.

## Exploratory proposal gate
Combined adaptive ellipse evidence, independent header axes, minimum row/column support, two interior decimal dot+ring checks, outer absence, glyph order. Diagnostic thresholds not calibrated; chosen during debugging. All four real crops proposed, all six component checks passed. Previous learned models declined all four. This is progress in diagnosing the known photo, not generalization evidence.

Fresh synthetic smoke controls: rejected 3/3 valid (joined, separated, faint) and 4/4 incompatible (shifted boxes, wrong digits with header, extra outer ring, repeated digits). Hence the prototype is not a viable general detector. On five altered versions of one real crop, rejected extra outer bubble, shifted writing boxes, missing decimal, missing digit row; accepted swapped 0/1 rows. The latter exposes that cyclic alternative comparisons plus an 8/10 row threshold cannot reliably reject arbitrary permutations. Photo-derived controls are not independent.

## Disposition
Keep experimental changes isolated. Next use pitch-consistent multi-scale hypotheses rather than pooling per-pixel maximum across scales; compare arbitrary digit permutations and repeated-row alternatives; verify on independently generated mock paper and captures, including direct actual-app baseline and exact 42-position mapping. No claim of improved grading, physical-device timing or production readiness. Full runnable code and diagnostic results supplied privately to owner in Cycle 4 archive. No paid computation.
