# M3.1 markerless layout verification

**Status:** One corrective cycle authorized. Product Owner approval is required for acceptance and merge. M3 candidate `5b9fe1a8` failed the independent `interleaved/wrong-same-grid` case in [M3 Chromium](https://github.com/ccheng/talus-scree-mark/actions/runs/44985966075). The accepted M2 Pages build remains live until the M3.1 automated safety gates pass.

## Scope and acceptance

- Reproduce the wrong-print, same-response-grid sheet and verify that geometry evidence cannot substitute for evidence of layout identity. Inspect descriptor resolution, registration search, match uniqueness and score thresholds. Compare valid re-rendered sheets and incorrect lookalikes with separate score distributions.
- Preserve blank-sheet enrollment, the three calibration levels, manual corners, local revision storage, repeated scanning and the coded M2 control. Reuse genuinely equal response maps without inferring the assessment or answer key. Conflicting indistinguishable maps require a per-capture human decision, while a conflicting available printed signature requires rejection.
- Preserve M1 and M2 suites. Make the original wrong-layout case and additional lookalikes permanent regressions. Include positive same-layout cross-renderer and genuinely equal mapping cases. Require fresh rejection on each incorrect capture and no accepted items from a rejected sheet. Report any drop in valid coverage and all review paths.
- Freeze the exact runtime, descriptors and acceptance rules before independent scoring. Rerun focused Chromium tests and independently score protected standard and stress captures. Report accepted and planned item counts, silent errors, sheet retakes and score separation. A synthetic result does not establish physical iPhone performance.

## Protected benchmark checkpoints

The Research Evaluator prepares separate development, holdout and reserve manifests. The protected checkpoint includes the generation code and version, seeds, fixtures or stable regeneration instructions, labels, scoring runner, protocol and SHA-256 digests. Preserve it privately before scoring and verify restoration against those digests. Keep raw fixtures, labels and their retrieval references out of the public repository and Developer messages. Use only synthetic material. Developers receive aggregate results and independently designated public reproducers. If a held-out case becomes a development input, score the frozen correction on an untouched reserve.

The Independent Tester owns the browser oracles. After this bounded correction and retest, stop and report the disposition. Deploy only a candidate whose automated safety gates pass. Physical iPhone workflow, human setup effort and physical recognition/latency remain separate acceptance evidence.

## Independent baseline diagnosis

On frozen M3 v3 the independent diagnosis read all 36 valid standard sheets exactly. It automatically accepted 16 of 18 same-grid wrong-layout photos, issuing 354 automatically accepted item observations from those sheets. The 12 clear wrong identity, competing profile, mirror and clipping controls all rejected.

| Printed identity case | Baseline lead similarity range |
| --- | --- |
| Valid, same renderer | 0.9866–0.9975 |
| Valid, different renderer | 0.8966–0.9281 |
| Wrong, one short printed edit | 0.9016–0.9894 |
| Wrong, two localized edits | 0.8099–0.9428 |

The overlap rules out using a single cutoff on the coarse score to retain the observed valid cross-renderer coverage while rejecting the observed lookalikes. The reserve was kept separate and checkpointed before the correction was scored.
