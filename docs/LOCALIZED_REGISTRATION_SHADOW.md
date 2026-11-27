# Localized registration shadow evaluation

This development branch builds on the standalone extraction at `7c9251b` and the [REG-R1–R3 frozen handoff](https://github.com/ccheng/talus-scree-mark/blob/854ad35c95f12604db2361c3529c9473fa5b9bca/research/psa-localized-registration/REG-R1-R3-HANDOFF.md). Main, the deployed development app, the precache and the app's normal reader remain at their prior versions.

## Candidate

`enrollLocalizedShadow(blankImage, profile, pageToSource, { confirmedExcludedRows })` produces serialized, versioned evidence bound to the exact mapping and revision. The optional rows carry teacher-confirmed bubble centers and radii. The engine requires unique raster corroboration inside an explicit exclusion on the enrollment blank.

`evaluateLocalizedShadow(image, profile, { batch, corners, evidence })` returns the exact Established result alongside separate shadow diagnostics. Hard vetoes remain authoritative. A rejected response-geometry scan can be examined for structural evidence when manually supplied corners provide a working pose. Print comparison uses an Established registered pose. The versioned API is standalone and has no persistence, production UI, worker or cold-start PWA integration.

- MC print uses bounded residual alignment, contrast-normalized correlation and approximate bandwidth matching against the enrolled print. Headers use the frozen R1 operating point. Applying that threshold to number sites is exploratory. Site agreement, mismatch, obscuration and indeterminate evidence are separate outcomes. None gives scan authorization. A mismatch may reflect occlusion or ordinary capture variation.
- Scope compares unique observed ring footprints against required rows first. A partial MC-only profile can classify a known row as outside scope only with an exact whole-row match and an explicit enclosing exclusion. Missing, ambiguous or overlapping required geometry withholds in shadow; an observed unknown addition requests review for partial and withholds for complete profiles. The result describes observed MC-aligned lanes. It cannot prove the absence of rows elsewhere or prove printed semantics.
- The initial raster detector confused text and headers with extra rows. The bounded correction requires the Established guard's 70 percent lane support and ten of twelve perimeter crossings on measured rings for new rows. It also validates the position of serialized print evidence against its enrolled site. Neither correction changes Established.
- NR localized identity and mark-versus-print discrimination remain research. The candidate introduces no NR semantic or mark-policy change.

## Verification

The ISTE independently sealed eight varied synthetic full-sheet photographic profiles and captures, including different font families, slanted and rotated captures, changed print, erased and obscured sites, partial and complete scopes and structural negatives. The comparison checks exact output against both the direct reader and pinned deployed source. All 71 automatic and manual scan paths preserved Established output byte-for-byte. Seven separate guards also passed: mirror, multiple sheets, wrong batch, no evidence, corrupt evidence, stale revision and implausibly misplaced evidence.

In each mode, four of six changed headers were flagged, one changed header appeared to agree, and one was unavailable. All three changed number sites were unavailable. Three of four erase/scribble cases flagged a mismatch, and the fourth was indeterminate. Unchanged recaptures produced false flags on 1/10 sampled automatic scans and 2/10 sampled manual scans. Those results prevent interpreting a flag as a substituted glyph or an agreement as a verified identity.

On the structural set, the corrected shadow disposition matched 3/12 automatic and 9/12 manual cases. Seven automatic cases had no trusted pose. The correction removed the 25 nonmatching detected bands per mode. The known/excluded row was localized and classified correctly with manual corners on the upright form. Shifted and distant unknown additions were both missed and incorrectly reported geometry-consistent when evaluated. Their actual centers were beyond the association range of the enrolled lanes. The rotated known-exclusion case withheld after missing required rows.

All 75 Node tests passed. A local Chromium smoke test imported the modules, switched offline, enrolled from local pixels and compared an unchanged capture with a single changed header. The changed header was flagged and both Established results remained identical to direct reads. There were zero requests during evaluation. This covers a loaded browser session. The app does not load these modules in its deployed shell.

The frozen REG-R3 coordinate prototype reproduced 25/25 named cases and 100/100 in each of three synthetic jitter strata. That contract evidence is distinct from whole-sheet raster evaluation.

## Disposition

Keep both paths in shadow. The localized MC signal can aid a future diagnostic workflow, but its current decisions cannot gate grading. Scope needs measured out-of-lane coverage and reliable observed footprints before it can inform policy. Refer the reproducible misses back to the PSA without changing the frozen comparator threshold or the production safeguards.

The MC referral is to distinguish reliably localized glyph substitutions from erasure, scribble and normal recapture variation. Replay the sealed open B→K miss, unchanged oblique false mismatches and erase/scribble cases with the automatic and independent oracle glyph windows to isolate the locator from the comparator. Report number enrollment separately, including multi-digit and right-side numbers. The B→K mismatch distance was lower than several unchanged oblique distances, so threshold changes alone cannot separate those cases. The scope referral is to detect valid unknown rows outside the enrolled lanes while measuring false footprints from text and retaining whole-row corroboration, uniqueness and hard safety vetoes.
