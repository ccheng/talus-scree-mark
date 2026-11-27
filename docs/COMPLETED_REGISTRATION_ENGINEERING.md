# Completed-sheet registration engineering evaluation

Baseline is main `896cabc04ecb2a468a0a76d0b69a117afc73d855`, deployed build `17240ea326d6d2fe470c5270`. Research source is the [frozen PSA handoff](https://github.com/ccheng/talus-scree-mark/blob/5110905f01d63e39646cd014bf22312f410b8002/research/psa-registration/REG-HANDOFF.md). This branch is for evaluation. Product integration and deployment require a separate decision.

## Development API

- `enrollRegistrationEvidence(blankImage, profile, pageToSource)` accepts a teacher-confirmed blank with a page transform, arbitrary validated profile IDs and supported page sizes. It returns a versioned, JSON-serializable envelope tied to the exact profile revision and geometry. It uses only print near supported semantic locations and independently matches print outside response regions for geometric experiments.
- `validateRegistrationEvidence(evidence, profile)` checks the mapping binding, site identities, bounded coordinates, patch dimensions and sample ranges. It reports expected, enrolled and missing sites by type.
- `readStructuredRegistration(image, profile, { batch, corners, evidence, assessPose })` returns the Established read contract with candidate diagnostics. With evidence omitted, the Established result is identical. Enrolled evidence can withhold the Established read, returning no items on a confirmed semantic conflict. `no-confirmed-conflict` can include ambiguous, masked, weak or unavailable observations and confers no semantic assurance. Coverage is reported separately from usable scan evidence.
- The optional `assessPose` path uses enrolled print, held-out anchors and a bounded projective correction. Its proposals are diagnostic. Established remains authoritative for batch, mirror, rotation ambiguity, multiple sheets, clipping, printed-landmark conflicts and response geometry. A partial-profile flag or exclusion does not relax that gate. Source reading and grade/review contracts remain Established.
- The extraction leaves the frozen quadratic deformation search, direct-source affine mark reads, and scope exemptions in research. The evidence envelope round-trips as JSON on its own. Product storage, backup/restore wiring, registration controls, worker and app-shell integration are outside this branch; no enrollment evidence is written or used by the deployed app.

## Independent evidence

The ISTE sealed seven heterogeneous synthetic families with 36 JPEG scenarios and independent bubble locations, printed layout intent, and response oracles. The frozen script's six targeted batches reproduced 7/9 accepted valid and 9/9 withheld incompatible examples on its own generator. These are separate from the heterogeneous comparison. The frozen script has no API for independent fixture input.

| Automatic scans | Established | Extracted engine |
|---|---:|---:|
| Valid sheets read | 13/19 | 13/19 |
| Incompatible sheets withheld | 9/17 | 11/17 |
| Exact observations on compatible reads | 83/114 | 83/114 |
| Additional item reviews on compatible reads | 31 | 31 |
| Incorrect clear items on compatible reads | 0 | 0 |
| Adjudicated grades matched oracle | 13/13 | 13/13 |

The candidate added withholding for the full NR digit permutation and mixed MC header permutation. It still read six improper layouts: single MC header and question-number replacements, one NR digit replacement, a changed right-side number, an unknown row outside a partial profile, and an unmapped enrolled row on a complete profile. On the manual-corner subset, both read 12/15 valid, withheld 2/6 incompatible, and matched 72/103 observations. None of the extra reviews on applicable rotated or low-resolution valid reads was cured by this adapter. On the low-resolution quarter-turn MC case all 12 items went to review despite subpixel p95 placement. An NR-only case enrolled all 126 expected glyph sites, yet a clean scan had 117 ambiguous and nine masked sites. Missing evidence and unchanged print are distinct.

Node verification passed all 72 tests. A developer Chromium smoke test loaded the standalone module locally, switched the context offline, enrolled from in-memory pixels, read a valid NR scan and withheld its incompatible permutation with zero observations and zero scan-time requests. It did not exercise PWA cold launch or deployed worker caching. The evidence reached 2.03 MB for the three-grid NR profile in the independent Node test. iPhone Safari, installed PWA behavior, and mobile memory/latency remain unmeasured.

## Disposition and focused PSA question

Hold product integration. The ISTE and PSA found all three localized conventional replacements yielded zero strong conflict votes at the changed locations. On the valid rotated controls, isolated spurious votes were already present. Lowering the group vote threshold will miss these replacements.

The focused PSA question is whether a localized same-print comparison can separate single replacements, including glyphs absent from the reference bank, from ordinary recapture, rotation and sampling variation. Freeze group voting and compare paired same-print and changed-print controls with independent site alignment and scan-quality evidence. Measure enrolled and usable coverage, missed changes, incorrect confident reads, and extra reviews at each orientation and resolution. A separate scope-aware geometry question is whether known out-of-scope print can be distinguished from unknown additions without masking changes to in-scope responses. Keep the Established safeguards in force during both investigations.
