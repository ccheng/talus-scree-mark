# REG-R8–R12 research handoff and disposition

## Baseline and scope
Engineering baseline: `development/psa-registration-r4-r7`, commit `c338ac514a7eb4f7ad2d50e80b6bb48f3e2ea882`. Referral: `docs/REG_R4_R7_ENGINEERING.md`. Prior PSA handoff: `7cbbe41f33f661980c6719e4ee599bcb8d259544`. Research-only branch. No product source, production threshold, mark recognition, profile authorization, hard veto, deployment or student data changed. The bounded R8–R12 investigations are complete; that does **not** mean every underlying recognition problem has been solved.

Exact original ISTE open images, independently annotated glyph windows and reserve captures were not available in the accessible repository material. All experiments here use PSA-authored synthetic raster or glyph fixtures; they do not reproduce the original condensed-font B→K case or the seven exact automatic-pose failures. Shared generators and repeated conditions mean counts are not independent population samples. Execution used pinned JS modules in a JavaScript isolate with module loading adapted; not independent Node CLI, browser or device execution. No product full test suite was rerun. R11 directly executes the Established reader in the isolate. The saved-record audit is not a rerun of the research or product regression suite.

## Reproduction
From the repository root with Node, run each file under this directory:
- reg-r8-r9.mjs
- reg-r8b-bank.mjs
- reg-r9b-damage.mjs
- reg-r10.mjs
- reg-r10b-recovery.mjs
- reg-r10c-context.mjs
- reg-r11-enrollment.mjs
- reg-r11-pose.mjs
- reg-r11b-pose.mjs
- reg-r12-audit.mjs

The corresponding *-results.json files contain full observations. Enrollment and contextual test saved files include a summary and records; their executable scripts print the records array. R8B uses the bundled bank and HOG implementation; copies exact private canonical/classify functions from the pinned raster module for a fixed-window probe. The bank was loaded with the existing loadBank validator; worker SHA checks were not independently rerun. This is not the whole-page glyph front end. No new trained model or recognition asset was added.

## R8: appearance and independent identity
R8/R9: 540 vector-glyph comparisons; 270 calibration and 270 evaluation. On held-out styles (54 unchanged, 108 substitutions, 54 erase, 54 scribble), existing correlation flags 69/108 substitutions, 0/54 unchanged, 11/54 erasures, 2/54 scribbles. Spatial gradient descriptor flags 37,0,2,1; normalized ink distance 35,0,0,0. OR of gradient and correlation flags no additional genuine substitutions; AND flags 37 substitutions, 2 erasures, zero scribbles/unchanged. Neither alternative justifies a new gate. Oracle windows and transforms isolate appearance, but synthetic strokes are not actual condensed fonts.

R8B: another 540 comparisons using actual frozen MC Structured Discovery bank (540 templates, 324-dimensional HOG, alphabet 0–9/A–E). K not represented. Calibration correct label 34/54; max distance 1.7783791610, minimum margin .05 (calibration-only, exploratory). Held-out:
| Condition | n | Existing comparator | Classifier identity mismatch | Either |
|---|---:|---:|---:|---:|
| Known-alphabet substitution | 72 | 42 | 60 | 66 |
| K substitution | 36 | 33 | 2 | 34 |
| Unchanged | 54 | 0 | 19 | 19 |
| Erasure | 54 | 8 | 4 | 12 |
| Scribble | 54 | 2 | 11 | 12 |
Known substitution correct label 41/72; unchanged correct label 32/54. Two K captures pass the distance/margin gate with forced in-bank labels; a mismatch is not a correct identity. Existing bank is unsuitable as a semantic compatibility gate. Its discovery use is unchanged. No broad new OCR training recommended without actual open failure images and separate data.

## R9: damage observability
R9B: 540 further synthetic comparisons, new parameterized styles, calibration on same-print controls, no threshold adjustment on evaluated styles. Directional add/remove heuristic: one-sided signal on 54/54 erasures, 81/108 real substitutions and 3/54 unchanged; both-sided condition detected zero substitutions or erasures. Baseline flags 66/108 substitutions, 13/54 erasures, 0/54 unchanged and scribbles. This heuristic does not solve attribution. Nine idealized pairs were rendered separately from printed P and R with its additional diagonal stroke entirely removed, under identical sensor phases and noise: 9/9 identical pixel arrays and 9/9 identical comparator outputs (agreement). This demonstrates a possible nonidentifiability condition, not the prevalence of real damage. A mismatch or agreement never establishes the cause or whole-sheet identity. NR semantic/mark ambiguity remains unresolved and outside these MC tests.

## R10: ring observability, grouping, context
R10: 24 raster scenarios, 21 true rows. Actual pageRingCandidates/circularWitness and frozen residual discovery: baseline 13/21, graph set-packing 19/21. All six two-choice/broken-pair rows recovered; mixed 5/6, close mixed 5/6 unchanged, five-choice 3/3. Text-like pair triggers three extra tentative proposals; text-five triggers both methods. Two-ring geometry alone cannot identify a response row. Set-packing is bounded by point/hypothesis/component/node limits; near-ties and budget exhaustion must stay visible. Score is an engineering hypothesis, not a calibrated likelihood.

R10B: 44 raster scenarios (includes prior case families, extra layouts and very-low-resolution), 44 true rows, 164 true rings. Baseline 27 rows, graph 35, local recovery + graph 36. Visible 153 rings before, 155 after. Two additional locally measured rings, zero false recovered rings in this set, no proof of general precision; full proposal sets can still be wrong. Local recovery searches bounded neighborhoods of pair-extrapolated positions but requires 20/24 actual radial contrast samples, visible interior and localization quality; no inferred ring accepted as measured. Severe low-resolution cases remain missing outlines and/or incorrectly grouped.

R10C: 24 scenarios, three capture settings, independent nearby number-like ink witness plus blank footprint inventory. All 9 true pair scenarios produced geometric proposals; only 3/9 had unique nearby ink context. Six non-response cases also had this context (three decorative and three moved unclassified). Stable unclassified pair correctly identified 3/3, moved inventory 3/3; neither prior presence nor nearby ink authorizes scope exemption. Identical visual pair-plus-label patterns can have different semantic meanings. Keep off-lane two-ring footprints as tentative diagnostics with context and inventory provenance, never automatically withhold or approve based on them. Explicitly retain unresolved/missing rings and ambiguous groupings.

## R11: dense enrollment and pose coverage
R11 enrollment: 24 scenarios, 144 true sites. Actual LSDE enrollAdaptiveMcPrint 96 correctly localized, 16 unverified enrolled; component-first prototype 60 correctly localized, zero unverified enrolled. Tight-pitch 0/24 versus 12/24. Some faint dense layouts recover true headers where baseline enrolled unverified print. Conservative grouping misses many number groups (including ordinary cases) and groups around competing headers. Coordinate accuracy <=1.5 pt is not independent OCR identity or proof that the full fixed comparison window contains only the intended glyph. Candidate is complementary segmentation/ambiguity evidence, not replacement. Exact dense ISTE 0/19 family not reproduced.

R11 pose: eight synthetic capture/safety cases; R11B repeats those eight and adds three. Actual Established readProfileSheet used; generator oracle corners used for comparison, not auto pose selection. Final 11-case set: 5/6 valid auto reads (upright, projective, quarter-turn, cropped with virtual corners, low-resolution); faint/very-low-resolution retake, oracle manual read. Crop oracle manual retakes due out-of-frame corners. All 5 invalid cases auto/manual retake with zero items: adjacent extra, rotated adjacent extra, missing row, mirror, wrong batch. For structural retakes, separate existing outlinePoseProposals diagnostics yield at least one correct (<2px max ring error, scored against oracle) candidate in all 3 geometry-incompatible controls; multiple distinct held-out-supported candidates in each (3 clusters), so bounded uniqueness check proposes none. Faint valid retake has no outline proposal. No hard veto recovery attempted and no product decision altered. The pilot cannot establish recoverability of the original seven auto failures. A trustworthy diagnostic pose can be distinct from authorization to recognize; do not assume a retake is solely a pose failure.

## R12: audit and decision
Saved-record audit: 20/20 checks. Totals: 1,620 glyph comparisons plus nine idealized equivalence pairs; 92 structural scenarios; 24 enrollment scenarios; 19 pose runs across two harnesses (11 distinct cases; first eight repeated). Counts are experimental records, not independent samples. All original safeguards remain unchanged by construction. No claim of independent ISTE validation, complete regression suite, physical iPhone or live deployment acceptance.

### Recommended next step
End this bounded PSA cycle rather than repeat synthetic tuning. The strongest engineering opportunity is diagnostic evidence and review usability, not another attempt to make semantic compatibility an automatic gate. Keep all new methods shadow-only unless PO separately authorizes a narrowly scoped engineering evaluation.
- LSDE: prioritize practical classroom acceptance of the existing deployed reader. If authorized, adapt tentative two-ring/competing associations, observed/missing ring quality, localized mismatch crops and enrollment ambiguity indicators into one coherent shadow diagnostic representation. Reuse reference-footprint inventory and existing safeguards; do not introduce a second production grader. Local recovery and component segmentation are optional comparative techniques, not default replacements. Keep Established byte-for-byte output and hard vetoes. No automatic scope exemptions, identity verdicts, or overrides.
- ISTE/LSDE: make the exact previously referred open synthetic JPEGs, profiles/revisions, oracle windows/poses, ring ground truth, expected outcomes and reproduction runner accessible to PSA in a private research fixture bundle, keeping independent reserve cases separate. Replay condensed B→K, unchanged oblique/low-res, damage, dense enrollment, mixed low-res, off-lane pairs and unavailable pose. Include actual device evidence with PO's permission, no real student data. Measure false-clear risk, review/retake cost, observable coverage and teacher time rather than only detector counts.
- PSA: return to targeted research only on reproducible independent failures that materially affect real classroom use. Fundamental visual ambiguities should be handled with a safe review/recapture workflow, not threshold tuning. Existing glyph bank and directional damage heuristic are negative findings; do not integrate as semantic gates. No new OCR model training or broad architecture rewrite authorized or recommended from these results.
- PO: decide whether the limited shadow diagnostic evaluation is worthwhile versus prioritizing physical iPhone acceptance and classroom workflow. No deployment or mainlining requested here.
