# M2 independent synthetic evaluation

The Research Evaluator froze the candidate and synthetic holdout before scoring. The holdout and reserve derive from the same printable reference profile and use distinct answer patterns and transforms. They are synthetic engineering evidence. Actual printed-sheet recognition, productive classroom coverage, physical-device timings and their uncertainty require a separate physical run.

| Identifier | Value |
| --- | --- |
| App release | `c7c778c9b5411e111938540c` |
| Algorithm / thresholds | `coded-reference-1` / `reference-v1` |
| Reference profile SHA-256 | `3c47f44df558e3b5cb693d883bfe76b9c50a66f3b1e7a049d8b5c7127764e8e8` |
| Holdout manifest SHA-256 | `673854a5cf6c93b0af091e9997286184f34a977f041c4905ff3f6dc6328a1c5e` |
| Unopened reserve manifest SHA-256 | `e96070bab2f94c576d4962b304e33d069f509b56be2f3385facf9562ffd22d90` |

## Standard synthetic captures

All 24 standard sheets matched the frozen oracle exactly, with zero retakes and no item reviews.

| Response | Planned | Automatically accepted | Silent errors among accepted | Silent errors among planned |
| --- | ---: | ---: | ---: | ---: |
| MC | 288 | 288 | 0/288 | 0/288 |
| NR | 96 | 96 | 0/96 | 0/96 |

Automatic coverage was 100% for each type. NR comparison included each literal character, its slot, and its observed state. The bubble-only control with oracle geometry had the same counts. The p95 displacement was 0.11166 bubble radii and the maximum was 0.11717 across 5,376 projected check landmarks and bubble centers independent of the fitted anchors. Node engine-only latency on the standard set was 47.5 ms p50 and 69.7 ms p95. These timings exclude image decode, browser worker lifecycle and UI paint.

## Synthetic stress and rejection

All 33 stress fixtures met their predefined dispositions. Required results included 11/11 blocked whole-sheet negatives, 6/6 reviewed obvious double marks, 4/4 preserved and flagged convention-invalid NR strings, and 4/4 local damage cases marked unreadable. The five weak, rival or light-mark cases were read correctly or reviewed as prescribed. Across the full stress set 12 sheets were retaken. MC auto-accepted 233/396 items with 0/233 silent errors, and NR auto-accepted 70/132 items with 0/70 silent errors. No seeded blocking failure was observed.

## Interpretation and pending evidence

The paper profile, renderer, and image transformations are shared sources of dependence. The observed zero-error ratios are exact for these fixtures. They do not establish a clustered or physical population interval, and there is no verified physical reliability estimate. The required physical benchmark remains pending, including independent printed sheets, iPhone Safari and Home Screen checks on the hosted release, standard and stress counts, clustered error uncertainty, and shutter or file selection through painted review timing.

The Evaluator kept the sealed fixtures outside the public repository and the reserve unopened. For the physical procedure and quick iPhone workflow, see [M2 physical evaluation](MILESTONE_2_PHYSICAL_EVALUATION.md). The implementation PR records independent browser and deployment evidence separately.
