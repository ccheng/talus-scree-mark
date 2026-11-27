# PSA localized registration research — REG-R1, R2, R2B and R3

## Status and provenance
Research only; no change to app modules, main, LSDE branch, Pages, model assets, real answer sheets or student data. Parent: LSDE extraction 7c9251baa815a3d2927c9778b8cf5721d4f80562. Referral: docs/COMPLETED_REGISTRATION_ENGINEERING.md at that commit. Existing group voting is frozen. This cycle uses PSA-authored isolated synthetic glyph sites and coordinate cases, not the ISTE's sealed fixtures or actual app reader. No independent acceptance; no integration or deployment recommendation.

## Reproduction
From this directory, with Python and Pillow 12.3.0, NumPy 2.3.5, OpenCV 4.13.0, system fonts at the paths embedded in each script:
```sh
python reg_r1.py > /tmp/reg_r1_results.json
python reg_r2.py > /tmp/reg_r2_results.json
python reg_r2b.py > /tmp/reg_r2b_results.json
node reg-r3-scope.mjs
```
Python pilots executed in a local container, not browser or app. They emit complete case records as well as summaries. The JS scope harness executed in a JavaScript isolate, not separately through Node; committed results are in reg-r3-scope-results.json. Two discarded attempts to implement the glyph generator with manually transcribed masks failed validation before producing measurements; switched to actual system-font rasterization. R2 corrected an initial duplicate-key error before running. No results from discarded attempts.

## REG-R1: direct same-print comparison
4,256 paired glyph-site captures with finite raster resolution, blur, phase, contrast, illumination and bounded residual displacement. DejaVu Sans and Liberation Serif calibrate thresholds; DejaVu Sans Mono and Lato Medium held out. The held-out 2,128 observations consist of 224 unchanged, 1,824 changed, 80 full-mark controls. Only 184 unchanged and 1,464 changed passed the experimental observability gate. Metrics: raw squared difference; bounded contrast-normalized difference; bounded, approximately bandwidth-matched centered correlation (NCC). Fixed max of same-print calibration scores + .01 per kind; not optimized on held-out fonts.
| Held-out | Raw | Normalized | NCC |
|---|---:|---:|---:|
| Changed flagged / 1824 | 344 | 464 | 1184 |
| Unchanged flagged / 224 | 2 | 0 | 0 |
| Unseen MC header replacement flagged / 192 | 52 | 146 | 191 |
| Full-mark controls flagged / 80 | 0 | 0 | 0 |
NCC flags: 377/384 changed headers; 807/1440 changed NR digits (807/1080 usable). By capture stratum: ordinary 349/456, quarter-turn 381/456, oblique 361/456, low-resolution rotated 93/456 (low-resolution digits unavailable by design). All 80 full marks classified masked. This is evidence for a same-print mismatch signal, not a contradiction certificate. Unflagged does not mean verified. False-positive denominator is 184 usable unchanged sites, not 224 independently verified sites. Pairs share fonts, glyphs, and conditions; do not treat as independent population samples.
Thresholds (raw, NCC, normalized): header .0560553281, .2146609521, .0623019917; digit .0421108811, .3768934107, .1361352897.

## REG-R2: native pixels and independent ring anchoring
2,160 comparisons; new held-out Noto Sans and FreeSerif fonts. Density-conditioned thresholds calibrated on original two calibration fonts. Added faint print, partial strokes and erasure controls. Native-pixel method projects bandwidth-matched reconstructed enrolled raster onto scan lattice, uses ring-only alignment before bounded glyph comparison for NR. Simulated nominal camera coordinates available, true local displacement and true blur not provided to comparator. Neither method is the production reader or same as R1 threshold policy.
| Held-out | Rectified | Native |
|---|---:|---:|
| Changed flagged / 560 | 173 | 259 |
| Changed usable / 560 | 476 | 426 |
| Changed digit flagged / 400 | 15 | 110 |
| Changed header flagged / 160 | 158 | 149 |
| Unchanged flagged / 280 | 3 | 2 |
| Unchanged usable / 280 | 237 | 211 |
| Full mark flagged / 80 | 0 | 0 |
| Partial mark flagged / 80 | 12 | 33 |
| Erasure flagged / 80 | 31 | 26 |
The native comparator helps NR sensitivity but is not safe for automatic mismatch withholding: occlusion causes many false flags. Low-resolution digits were unavailable by design; faint controls reduced availability. Native density-conditioned thresholds: header high .2954917049, medium .0990766978, low .1595761275; digit high .3350814080, medium .2674861050, low unavailable. Rectified header high .2618798113, medium .2069466805, low .2262780166; digit high .5568579829, medium .4870784378, low unavailable.

## REG-R2B: mark-aware gate, new font reserve
840 comparisons on Noto Serif and Liberation Mono, not used in previous experiments. Frozen R2 native digit thresholds. Research Python port of production per-bubble sampling/scoring formula (marks.js reference-v1 at LSDE commit) with enrolled per-site blank ink and .105 maximum blank fill; no claim of actual JS execution or production group-level calibration. Signed residual gate adds fixed -.10 bound to screen erasure.
| Held-out | Native flags | With blank gate | With signed gate |
|---|---:|---:|---:|
| Changed digit / 400 | 84 | 12 | 12 |
| Unchanged / 200 | 1 | 0 | 0 |
| Full mark / 80 | 0 | 0 | 0 |
| Partial mark / 80 | 26 | 0 | 0 |
| Erasure / 80 | 29 | 28 | 28 |
Only 41/200 unchanged sites pass the mark gate, and 77/400 changed; the signed gate does not improve false erasure flags. Negative result: production-style fill score alone is not enough. Both partial marking and true substitutions can change core ink. Erasure can imitate altered print. No threshold adjustment on these reserves. Do not simply suppress marks or lower group votes and claim semantic identity.

## REG-R3: scope-aware structural evidence
Actual markerless-registration.js extraRows returns a count, not observed row footprints; current blockGeometry requires no excess rows, regardless of profile scope/exclusions. Profile exclusions are authoring discovery rectangles, not scan-time compatibility authorizations. Prototype pure JS coordinate-level contract consumes separately localized, unique actual row observations and teacher-confirmed enrollment bound to profile revision/geometry. Matches required rows before extras, requires whole-row one-to-one footprint correspondence and explicit non-overlapping exclusion for known extra rows in partial MC-only profile. Unrecognized additions are review for partial and withheld for complete; missing required rows, duplicate observations, overlapping exclusions, stale binding or hard veto withhold. Geometry-consistent explicitly has semanticAssurance:false. Complete profiles never automatically exempt extra rows merely on scope/exclusions. Policy prototype: 25/25 named cases, 100/100 each bounded jitter valid, unexpected addition review, missing required withholding. Identical geometry with changed print remains geometry-consistent and requires separate semantic evidence. Contract requires actual raster detection and mapping of unique observed rows; not an app gate. No threshold change or direct bypass of Established.

## Disposition and next ownership
- Freeze these pilots. No production change. MC header same-print comparison merits a shadow implementation and whole-sheet evaluation; isolated results do not establish single-site rejection safety (page multiplicity, mis-enrollment, alternate typography, right-side numbering, multi-digit numbers, decimal symbols, low quality and actual photo conditions still open).
- NR localized semantic verification is unresolved: native pixel sampling is worth comparative study but mark/erase ambiguity remains fundamental, and lower acquisition resolution reduces evidence. Retain frozen group-voting safeguards; classify observable same-print agreement, mismatch requiring corroboration, obscured and indeterminate distinctly. Do not certify unchanged print from absence of conflict. Do not automatically grade an otherwise incompatible layout.
- LSDE, with separate PO authorization, may extract a shadow-only reference comparison/observability API and preserve diagnostic row footprints from extraRows. No runtime policy weakening. Version enrollment evidence and bind it to exact template revision; avoid silently adopting fixture-specific thresholds. Native JS port, storage/worker/offline integration and mobile measurements remain open. The proposed scope classifier requires independently observed unique rows, no hypothesized positions; complete profile behavior remains unchanged.
- ISTE should design independently held-out photographed full-sheet families and ground truth before any threshold selection: genuine single MC/NR glyph replacements, right-side numbers, multi-digit numbers/decimal changes, normal/rotated/cropped/faint recaptures, dense fonts, mark/erasure controls, known/unknown/overlapping exclusions, added/missing/moved rows, and hard veto controls. Compare Established and frozen extraction, shadow candidate, false clear/retake, site enrollment and usable coverage, exact item observations and review effort. No real student data, no external upload. Evaluate sheet-level error rates, not just site-level counts.
- PSA should resolve independently reproduced failures and assess whether a two-channel design (structural/semantic) with explicit review is sufficient. Do not restart broad research or undertake repeated speculative optimization; the bounded follow-up on mark-aware gating did not resolve the blocker. Product Owner decides next engineering authorization and release acceptance.
