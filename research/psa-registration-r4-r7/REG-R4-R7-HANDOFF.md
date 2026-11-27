# REG-R4–R7 — localized registration research handoff

## Baseline, scope, provenance
Engineering baseline: development/psa-localized-registration, 79ef8419eb1ad2046e076141cb98e7d7df6e6a. Referral: docs/LOCALIZED_REGISTRATION_SHADOW.md at that baseline. Research branch is forked from the LSDE's shadow implementation, not main. No app source, deployed assets, registration thresholds, mark reader, safety policy, real assessment materials or student data changed.

The ISTE's exact sealed/open B→K, oblique, erase/scribble and structural JPEGs were not located in accessible repository material. This work reproduces the reported failure *classes* using newly authored synthetic page rasters and known geometry; it does not reproduce the exact independent failures. Executed in a JS isolate using the actual pinned modules (imports/exports adapted for execution); not an independently executed Node CLI, browser, physical camera or iPhone. No independent acceptance claim. All scripts preserve case-level JSON outcomes; reproduction from the repository root:
```sh
node research/psa-registration-r4-r7/reg-r4-r5.mjs
node research/psa-registration-r4-r7/reg-r5-reserve.mjs
node research/psa-registration-r4-r7/reg-r6.mjs
node research/psa-registration-r4-r7/reg-r6-reserve.mjs
```
Each corresponding *-results.json is committed. The reserve structural call timed out after writes; the branch head and stored results were recovered and inspected. The four experiments have 45+45+36+56=182 page scenarios (multiple methods per scenario; reserve structural tests also capture reference blanks; not independent population samples). No production full suite rerun.

## R4: isolate site localization from comparator and pose
45 captures, three synthetic layouts, three modes, five conditions each. Hand-authored vector glyphs and rendered page rasters, not real fonts or JPEGs. The actual LSDE enrollMcPrint, compareMcPrint, pageRingCandidates and projective fit routines were executed; reference-window oracle uses generator coordinates and reproduces the comparator's patch shape. Alternative number enrollment checks left and right independently; requires >=75% row support and a unique side. It is an ink-region locator, not OCR identity. Multi-digit token limits, actual typographies, mixed numbering, right alignment and incidental print need further evaluation.
| Per-target condition (9 each) | LSDE | Alternative + independent pose | Oracle window + oracle pose |
|---|---:|---:|---:|
| B→K mismatch | 6 | 6 | 9 |
| number change mismatch | 6 | 9 | 9 |
| unchanged B mismatch | 2 | 0 | 0 |
| scribble mismatch | 3 | 0 | 0 |
| erasure mismatch | 4 | 3 | 3 |
Unchanged other-site mismatches: 14 baseline, 0 corrected, 0 oracle. Unchanged B availability: 6/9 baseline and corrected, 9/9 oracle. Number enrollment: 8/12 baseline, 12/12 alternative, including 4 right-side multi-digit labels. Both automatic locators missed four offset header sites (8/12 enrolled). The fixed header operating point .2146609521 was unchanged; applying it to numbers is exploratory.
Pose correction fits a bounded projective correction from uniquely associated measured bubble centers, with holdout points and displacement checks, not from the glyph under test. All 45 proposed a correction on these clean synthetic rings. This does not authorize a scan: heldout rings, extrapolation, conditioning, orientation, validity of source pose and multiple-sheet/hard-veto handling require engineering. Preserve the Established pose as authoritative; only shadow print sampling may use a separate correction.

## R5: adaptive header windows and separate reserve layouts
45 more synthetic captures on three different layout parameter combinations, plus three enrollment-only negative controls. Header search is bounded by expected pitch and the safe gap above the first bubble row, with coherent aligned header sites; no fixed offset alone. Both sides for numbers. This reserve is PSA-authored and shares vector generator and mode families with R4; not independent. No comparator threshold retuning.
| Per-target condition (9 each) | LSDE | Fixed alternative + pose | Adaptive alternative + pose |
|---|---:|---:|---:|
| B→K mismatch | 3 | 3 | 9 |
| number change mismatch | 3 | 9 | 9 |
| unchanged B mismatch | 1 | 0 | 0 |
| scribble mismatch | 1 | 0 | 0 |
| erasure mismatch | 3 | 3 | 7 |
Unchanged B availability: baseline 3/9, fixed 3/9, adaptive 9/9. Additional unchanged-site flags 7 baseline, 0 fixed and adaptive. Header enrollment on the three ordinary reserve layouts: baseline 4/12, fixed 4/12, adaptive 12/12. Number enrollment baseline 4/12, alternate 12/12. Absent and competing header controls enrolled zero headers; two-sided number control enrolled zero number sites in alternative (baseline 4). Oracle-window field in enrollment-only controls is generator-proposed nominal windows, not verified labels and not evaluated as recognition. Adaptive plus pose corrects all 45 diagnostic poses in this synthetic set.
The erasure result is a blocker, not a tuning target. Even oracle windows and oracle pose flag six of nine erasures in the reserve. Difference does not establish cause. Do not change group thresholds or gate registration on these comparisons. Some erasures or overprinting can make identical observations to a changed symbol; camera-only classification cannot resolve such an ambiguity reliably without additional evidence. A mismatch is a diagnostic; independent OCR/identity, ink quality, context or teacher verification may corroborate it. NR localized semantic/mark discrimination remains unresolved; no NR change here.

## R6: independent row footprints
36 synthetic page scenarios, 12 cases × three exact known camera transformations (upright/oblique/quarter-turn), actual pinned pageRingCandidates and scope classifier. Baseline lane grouping is retained, then residual measured ring candidates are searched independently of x lane positions, with twelve-direction circular witness (>=10), bounded spacing/slope/radius, full observed sequences and uniqueness. No inference of missing positions; overlapping proposals withheld as ambiguous in research diagnostics. Existing PSA MC baseRows is executed for repeated-family comparison; its output is diagnostic, not the authority for new rows (it requires repeated 4/5-choice rows).
- Baseline correct dispositions 21/36; prototype 33/36.
- True unexpected rows localized 3/21 baseline, 21/21 prototype, including shifted/distant singleton, distant family, complete-profile extra, and filled row.
- Three false row proposals, all on a deliberately pixel-equivalent O-like ring text control; ordinary cross-shaped text and irregular rings did not trigger. This is a deliberate identifiability negative, not real font text. The prototype must never turn geometrically consistent or inconsistent into a scan authorization or automatic rejection. Known excluded rows still need affirmative teacher-confirmed enrollment, and required geometry remains authoritative.

## R6 reserve: expanded counts and reference footprint inventory
56 synthetic scenarios, 14 cases × four known poses, including low resolution and faint controls. Search lengths expanded to 3–8 (two-ring sequence deliberately unsupported). Compare candidate footprints with a blank inventory; unclassified existing footprints remain unclassified, not an authorized exclusion.
- Disposition correct: 20/56 baseline, 40/56 prototype. Novel true rows localized: 0/32 baseline, 20/32 prototype.
- Four of four each three-choice, five-choice, six-choice, slanted and marked five-choice additions localized. 0/4 two-choice, 0/8 rows in close mixed-count case. In mixed-count case overlapping hypotheses in three modes (six ambiguous proposals total); low-res mode misses without ambiguity, so lack of proposals is not negative evidence.
- Stable O-like text: 4/4 detected as previously observed unclassified; newly printed O-like pattern: 4/4 novel geometry proposals; removed O-like pattern: 4/4 missing inventory. Geometry cannot tell novel decorative ring text from a new answer row.
- Existing unclassified five-choice row: 4/4 identified as previously observed, still requires review (not an exemption). Known excluded row: 4/4 correct. Missing required row: 4/4 withheld. Irregular ring decoy: 4/4 consistent.
- JSON aggregate falseExtra=12 counts four stable O-like, four new O-like and four actual unclassified existing row footprints as not *novel true rows*; latter are not false geometric localizations. Do not report all twelve as detector hallucinations.
- Some baseline required-lane results and candidate scope outputs use oracle transforms; neither tests automatic pose recovery. Raster search is bounded by radii, margin, candidate limits, near-horizontal pitch and count; no global absence or full-page semantic certification. Ambiguous proposals must be made visible, not dropped into a geometry-consistent conclusion. Two-choice and close mixed rows, radius variation, overlapping hypotheses, broken outlines, dense real text and NR conflict handling remain open.

## R7 disposition: freeze, no grading gate or integration authorization
Important distinction: detect localized differences, assess whether they indicate a structural or semantic change, and authorize a grade are separate operations. Previous shadow Established output must remain exact. The research results support bounded shadow engineering and independent evaluation, not promotion.
1. ISTE/LSDE should provide the original open failure bundle with reproducible synthetic image bytes, blank profile/revision, corners/pose, ground-truth glyph windows and changed locations, row footprints, expected outcomes and exact test runner. Keep reserve fixtures independent. Exact open replay is the most valuable next step; do not tune to held-out outcomes.
2. LSDE may, only under PO direction, adapt the bilateral/adaptive label locator and independent anchor-based sampling correction to the native shadow API. Validate localization, coverage, ambiguous sides, bounded transform Jacobian and displacement at each glyph and outside anchor hull, resolution and independent heldout error. No production pose replacement, mark changes, enrollment semantics inference or silent threshold tuning. Compare baseline/oracle-window/oracle-pose/estimated correction on original open fixtures and independently designed reserve forms. Report per-site availability and false flags; preserve byte-for-byte Established reader result.
3. LSDE may adapt residual sequence detection and blank footprint inventory as diagnostic coverage. Keep whole-row corroboration and uniqueness, known exclusions only with teacher confirmation, unresolved new or ambiguous patterns as review evidence. Explicitly report unsupported two-choice/close mixed layout coverage and never treat absence of a detection as absence of added structure. Use existing PSA discovery geometry where suitable; avoid rebuilding duplicate detector pipelines. Validate profile binding, memory/runtime and image-based coverage before any policy recommendation.
4. PSA should investigate exact independently reproduced failures once fixtures are supplied, particularly erasure/changed glyph confounds, unavailable or ambiguous sites, 2-choice and mixed overlapping rows, and independent anchor reliability. Do not try to solve fundamental unobservable distinctions by thresholds or repeated synthetic tuning. If additional identity evidence cannot safely resolve them, recommend explicit teacher review/retake rather than an automatic verdict. NR deferred as previously agreed.
5. ISTE independent whole-sheet tests must exercise actual registration, grade/review, offline browser and iPhone workflows as appropriate. No mainline or deployment request until independent evidence and explicit PO authorization.

Recommendation: stop speculative glyph/geometry optimization on this generator now. The bounded follow-up found real residual blockers. Obtain exact ISTE open failure artifacts and use the localized methods for shadow evaluation only; a separate engineering authorization is needed.
