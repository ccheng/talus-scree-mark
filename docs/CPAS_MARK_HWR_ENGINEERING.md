# CPAS MARK and handwriting engineering preview

**Disposition:** retain the development preview. Keep Established authoritative for MC and NR. Consider the two promotion decisions separately.

## Running the preview

Check out the development branch, run `npm start`, and add `?cpas=preview` to the displayed application URL. Select a profile and confirm a batch as usual. Load a blank copy of the same form and revision using the preview panel, then scan a completed sheet. The panel reports what the CPAS MC candidate would accept under the experimental gate. Download the local JSON comparison for item and position observations. Established still supplies all grades. With no blank reference the preview reports reference-free observations and withholds all MC candidate decisions.

The optional handwriting map uses page coordinates in the selected profile, with one explicitly located writing box per NR slot. The shape is `{"profileId":"sample","revision":1,"boxes":{"Q22.1":{"x":100,"y":240,"width":14,"height":18}}}`. The preview checks profile identity and revision. Box regions must stay within their item, clear of bubbles and other writing boxes. No automatic writing-box discovery or persisted profile-schema change is introduced.

The blank is held for the current session. Registration checks the blank using the selected profile. The operator supplies the matching unmarked form. Geometrically compatible forms with different printed semantics can still pass geometry checks, as the open permuted-label control showed. A filled reference and other reference-quality problems require additional controls before any promotion.

## Engineering decisions

- Frozen handoff commit `70bcf73039054643419996a0d87e0cb6d0eb9647`. Consolidated archive SHA-256 `4fcb925bd2bcce6be8d1a1920da9ccf81b0d223e92f003d9720f1f43c9940627`.
- The worker compares native MARK-R7.3 spatial features and its frozen ExtraTrees scorer after Established admits the scan. The same candidate infrastructure samples either verified block-local pose or page pose, uses the matched blank where available, reports ink and spatial completion separately, and never takes an answer key. A reference-free run omits reference features and is exploratory.
- For MC, the research 1% empirical calibration gate is replayed as a diagnostic, with observable scan and reference rings required. Review includes incomplete, competing, low-confidence and unobservable evidence. The output supplies observed completion and candidate symbol with a separate decision field. Actual intent is unverified.
- For NR, position-level distributions, printed-digit blank-ink compensation where enrolled, reference residuals, and raw optical text and format checks are available. No NR response is marked as eligible for automatic acceptance. The original R5 hybrid agreement and response-level calibration are outstanding. Reference-free results here are a spatial ablation of the completion system. They do not reproduce the R5 hybrid.
- HWR uses the native adapted CNN and mixed-corpus symbol gate. Strong handwriting can corroborate or flag disagreement. Blank, absent or uncertain handwriting cannot fill a bubble position. The single-recognizer disagreement indication is advisory. R7.3 used agreement between two recognizers for its veto.
- The native scanner uses the existing markerless and block-refinement results. The CPAS coarse nonlinear field admitted 15/32 simulated valid captures and 0/24 negative captures in R7.2, with 0/6,672 admitted bubble centers outside half a radius. The fine gate admitted 1/32. Local support was substantial even on wrong and occluded layouts, and neither gate admitted severe crease or compound cases. Keep the field out of the native scanner for this increment. A later geometry-only shadow comparison can fit on independently stable printed features, use spatial holdouts, compare with Established and PSA block refinement and retain all existing identity checks.
- The packaged models total 711,392 bytes and are covered by the hashed offline shell. The preview keeps only the current blank in memory, and the worker terminates at the end of each scan. A repeated-scan phone trial still needs peak memory and responsiveness measurements.

## Independent evidence

The frozen R7.3 verifier reran 66,391 aggregate and consistency checks on 56,448 prediction records, including all 42 capture hashes. It replays frozen records. Regenerating those images requires the original MNIST inputs. Native scorer parity was 400/400 with a maximum probability delta of 2.98e-8. Independent synthetic patch experiments also checked the native preprocessing against the research computation.

The ISTE tested fresh open scenarios, then opened its sealed optical reserve after the candidate was frozen. The reserve comprised two new simulated layouts and 26 auto/manual capture paths. Across both reference settings, 52/52 results matched the Established payload exactly. Established admitted 20/22 valid paths and rejected all 4 moved-layout paths. The two valid registration failures remain in the denominators.

| Independent reserve metric | Established | CPAS with blank |
| --- | ---: | ---: |
| MC indications across all observations | 265/352 | 125/352 |
| Correct indications on eligible MC observations | 157/172 | 113/172 |
| Wrong indications on eligible MC observations | 0 | 0 |
| Indications that violated strict experimental review policy | 108/180 | 12/180 |
| MC review or registration-hold proxy | 87/352 | 227/352 |

The 12 CPAS violations were 11 faint erasure ghosts and one scribble. The review column counts item-level flags or registration holds as a proxy for teacher workload. It does not measure review time. CPAS reference-free produced zero automatic MC decisions by design. NR returned 18/30 exact eligible literal advisories and 40/44 item diagnostics with the reference, including three format warnings. All 44 remained review-only. Native HWR scorer parity was 80/80, max logit delta 3.84e-6. On 36 fresh prepared cells, HWR confidently recognized 8/18 digits and 3/3 dots correctly. Two of 15 negative cells were confidently read as the digit 7. These HWR cell results are separate from full-response NR evaluation.

Across 20 registered valid paths, added preview time on the test host was 466 ms median and 582 ms p95 with a reference. Reference-free overhead was 106 ms median and 151 ms p95. An offline Chromium reload served the opted-in preview and its model from the verified cache. The real worker evaluated 16 MC and 2 NR items in 737 ms above Established, whose result matched exactly. The two decoded RGBA inputs contained 23,656,600 bytes in total, exclusive of worker copies, model and scratch allocations. Physical iPhone latency, peak memory, camera handling and install/reopen in airplane mode remain unmeasured.

## Promotion recommendation

Retain CPAS spatial completion as the lead MC candidate. Refer the reproducible erasure and scribble cases for targeted examination of observable limits and teacher handling. Reconfirm the review policy with the Product Owner before changing any thresholds. Preserve the reserve as an independent result and use new sealed material for future tuning verification.

Keep the NR and HWR experiments in the preview. The next consequential question is whether optical agreement and reliably localized handwriting can improve eligible response coverage at a defined review burden. Prioritize response-level evidence and abstention over adding more uncalibrated signals. MC promotion can advance independently after its erasure and device checks.
