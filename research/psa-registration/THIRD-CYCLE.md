# Third registration research cycle — photographed enrollment, pose and semantic safety

Frozen application baseline: main 896cabc04ecb2a468a0a76d0b69a117afc73d855; release 17240ea326d6d2fe470c5270. All experiments are isolated synthetic development tests. No real forms, student data, private photographs, new model training or production changes.

## Evidence and reproduction

The harnesses import the pinned app registration, authoring, projective, mark-reading and (where appropriate) grading modules. Actual execution used a JavaScript isolate with imported modules adapted to its loader. No separate Node, browser or iPhone execution was performed. Run these commands from the repository root with a compatible Node version:

- `node research/psa-registration/photo-enrollment.mjs` — three layouts, ten cases each; photo-enrollment-results.json.
- `node research/psa-registration/pose-semantics.mjs 0 photo-90 photo-mc-symbol-permutation photo-crop-margin photo-perspective` — repeat with layout 1 and 2; pose-semantics-targeted-results.json.
- `node research/psa-registration/pose-semantics.mjs 0 photo-two-sheets` — two-sheet-results.json.
- `node research/psa-registration/grade-semantics.mjs 0 photo-question-number-swap photo-decimal-symbol-change photo-local-row-shift photo-flat photo-90 photo-crop-margin photo-shadow-deform` — grade-semantics-results.json.
- `node research/psa-registration/local-uncertainty.mjs 0 local-0.75 local-1.25 local-1.75 local-2 local-2.25` — local-uncertainty-results.json.

The full expanded batch timed out before returning results; it was split into targeted runs. Do not combine counts from overlapping revisions or treat these self-authored cases as independent validation. Only the listed targeted runs are verified for the later revisions, not a full retest.

## Photographed enrollment and heterogeneous layouts

Three layouts rearrange four response blocks, with an intentional MC row gap in layout 1. All have 14 MC and two NR items, 147 bubble positions. The enrollment blank raster is generated through a different perspective transform, noise and shadow, then rectified using confirmed synthetic blank corners. Automatic enrollment selects 16 printed landmarks and calibrates 84 NR bubble baselines per layout. Fonts remain simple bitmaps; no camera photos, authentic assessment layouts, or independent fixture authorship.

Initial 30-case suite: valid candidate 14/18 vs deployed 13/18; incompatible withheld candidate 12/12 vs deployed 6/12. 180-degree rotation 3/3 both; shadow plus deformation candidate 3/3 vs deployed 0/3; initial margin-crop candidate 0/3 vs deployed 1/3. Candidate accepted 14 captures with 219/224 exact status/rawText observations; five mismatches were NR review states rather than clear wrong answers.

## Pose model refinement

Previously the same displacement bound applied to projective pose correction and nonlinear residual deformation. The revised harness uses a separate global projective bound (42 pt, sampled min determinant .65, max gradient deviation .25), leaves local affine/quadratic bounds at 18 pt/.8/.18, checks positive convex corner orientation, page margin limits and all expected response centers in frame. This is a sampled provisional bound, not a mathematical global guarantee. Near-identity fallback when baseline registers, at least two landmarks per block, low displacement/held-out error, and no contradictory print. No general multi-pose ambiguity algorithm proven.

Targeted revised results: crop 3/3 (P95 source-pixel errors .256, .720, .532); stronger perspective 3/3; 90-degree rotations 1/3 candidate vs 3/3 baseline. The two rotation failures were insufficient per-block landmarks and NR semantic false conflict respectively. The accepted 90-degree case had two NR responses in review. A simple two-side-by-side-sheets control was withheld by both; candidate found zero corroborated landmarks, not an explicit multi-sheet detector. Three initial mirrored controls withheld, not rerun in the final revision.

## Semantic compatibility

Initial three-layout NR digit permutations withheld 3/3, deployed accepted all. New MC choice header permutations withheld 3/3, deployed accepted all; three of four changed headers flagged in each affected block. Further single-layout targeted tests: swapped first two MC printed question numbers (two conflicts among seven labels), printed digit 8 replacing an unfilled NR decimal dot (strong alternative match) both withheld; deployed accepted both. This is template patch comparison at known semantic coordinates, not general OCR or automatic semantic site enrollment. NR filled glyphs excluded from comparison. Missing/weak evidence must not be treated as contradiction. Real typographic diversity, partial fill, ambiguous glyphs and known identity vs incidental print require additional validation.

## Mark reading, grading and uncertainty

Actual app readBubbleRegions, templateSnapshot, gradeScan and addDecision executed for four valid targeted captures (flat, 90-degree, shadowed/deformed, margin crop). Exact status/rawText 60/64. Four additional unresolved NR observations (two in 90-degree, one each shadow and crop) all pending; zero unexpected clear observations. Ground truth has twelve correct responses, two blanks, two double-mark responses. Before adjudication: 12/16 with 2 pending (flat); 10/16 with 4 pending (90-degree); 11/16 with 3 pending (shadow and crop). After simulated adjudication using the known synthetic oracle: final 12/16, zero pending for all four. This tests the actual grading contract in memory, not UI, persistence, CSV, backup, or real human corrections.

Row uncertainty experiment displaces four bubble centers of Q5 while leaving other print unchanged. This is a local geometry stress test, not a physical paper model. .75 pt: all 16 observations exact. 1.25 pt: existing mark reader routes Q5 to ambiguity. 1.75 pt: prototype row-level radial ring search detects 2 pt best offset and emits local-registration-uncertainty; only Q5 is newly unreadable, grade provisional with 3 pending, oracle adjudication yields final 12/16. At 2 and 2.25 pt the existing whole-sheet geometry gate withholds reading. No other row flagged in the accepted cases. 2.5 pt shifted-row control withheld by both. Item-level registration evidence should never automatically remap a row in isolation.

## Disposition and next gate

Promising but not frozen for production. Main and Pages unchanged. Major residual problems: 90-degree recognition and NR ambiguity under low sampling resolution; semantic false conflicts; partial-scope and exclusions in the adjacent-row guard; automatic enrollment of actual semantic locations from photographed forms; broad multi-sheet, repeated-pattern, cropped-content, extreme perspective and spatially nonuniform pose tests; independent held-out fixtures and real-looking photos; robust cross-validation, pose ranking and deformation guarantees; native browser resource limits and full app workflow. Preserve existing registration as independently verified baseline and use a candidate as bounded recovery, never override a positive compatibility conflict. Recommend focused consolidation and independent held-out verification rather than further arbitrary threshold tuning on these fixtures.