# Registration prototype

Research snapshot `e45501a0c17591d496d3c97b4eb0b60ae3c181e0` uses the unchanged application and mark reader from PR #8 head `1fb979a` (development release `cdd9549`). The prototype runs offline in desktop Python/OpenCV and calls the existing Node-compatible mark reader. It is outside the PWA bundle, has no network calls, and handles teacher-enrolled MC profiles. Printed NR and written responses are present as distractors. It does not evaluate NR grading or modify key semantics.

## Reproduce

```sh
python -m pip install -r experiments/registration/requirements.txt
python -B experiments/registration/fixtures.py
python -B experiments/registration/benchmark.py \
  experiments/registration/generated/manifest.json \
  experiments/registration/generated/output
npm test
```

Dependencies are for local research. Pillow is also required for fixture generation. Use a supplied manifest and a private output directory to run a separate dataset. Manifests carry the enrolled block coordinates, blank and scan corner oracles, expected form validity, per-choice scan centers and expected answers. The matcher sees images, the profile, and the selected corner hint. The oracle is used to score outputs after alignment and reading. The automatic corner hint is the current app's estimate. The manual path uses exact fixture corner coordinates, so it does not measure touch placement accuracy.

The three paths are current, SIFT and line-junction matching with a robust global homography, and the same global fit plus a bounded per-block translation. The prototype uses outline contours, row and column support, held-out centers, checks for extra interior outlines and compares stable printed patches before reading. It uses the same reader at the resulting locations. The renderer writes a side-by-side overlay and the benchmark writes per-case JSON. Red outlines show projections, green points show the independent center oracle where applicable, and purple marks show matched detector observations. For a current-path rejection the overlay and error use the corner-based projection when one is available.

## Evidence

The tuning family uses four blocks totalling 14 MC items. Four correct-layout captures and three wrong-layout captures each ran automatically and with exact supplied corners. The independent tester froze a separate synthetic family before receiving the candidate. Its four blocks total 20 MC items. Three correct-layout captures and two wrong-layout captures each ran in both modes. Capture pairs model separate perspective, framing and illumination, with independent nonlinear deformations on the curled scans. Neither family represents physical phone captures. Runs in two corner modes share the same scan and should not be treated as independent photographs.

| Dataset | Method | Valid paths accepted | Exact / expected responses | Review | Wrong auto-accepts on valid paths | Wrong-layout paths accepted |
|---|---|---:|---:|---:|---:|---:|
| Tuning | Current | 4/8 | 56/112 | 0 | 0 | 2/6 |
| Tuning | Global features | 4/8 | 56/112 | 0 | 0 | 2/6 |
| Tuning | Block refinement | 6/8 | 78/112 | 6 | 0 | 2/6 |
| Independent | Current | 2/6 | 40/120 | 0 | 0 | 0/4 |
| Independent | Global features | 2/6 | 40/120 | 0 | 0 | 0/4 |
| Independent | Block refinement | 6/6 | 112/120 | 8 | 0 | 0/4 |

The independent flat scan read all 20 answers in every path. On the two held-out curls, automatic-mode p95 center error relative to the local bubble radius went from 1.913 / 1.474 with current corner projections, through 0.874 / 0.921 globally, to 0.305 / 0.391 with block refinement. The manual refined values were the same. The refined paths returned 17 and 19 exact reads with 3 and 1 review items respectively in each corner mode. All methods rejected the shifted-row and similar-but-different MC geometries. All accepted the tuning negative with unchanged bubble positions and a changed printed heading. The generic patch check cannot enforce form identity there. The strongest tuning curl failed the held-out global-feature geometry check before block refinement.

Median independent **local processing** time in milliseconds, automatic / exact manual: current 120 / 52, global 1557 / 1571, block 1488 / 1453. This is a single desktop pass across five captures per mode, including positives and negatives, and excludes decoding and process startup. Prototype automatic timing includes generating a corner hint. Runs were not paired timing trials and the global/block difference is not evidence of a speed advantage. No iPhone Safari measurement was made because the offline Python experiment is not a PWA build and no physical device was available. The exact reported Physics enrollment and failed photograph were unavailable. App tests passed 57/57.

## Disposition

Keep this as a research comparison and retain the current preview and PR separately. The independent result supports bounded block refinement as the next candidate. Before choosing a mobile implementation, compare it with a corners-plus-block-refinement ablation to learn whether SIFT and line matching justify their cost. Make form identity explicit using a nominated printed region or deliberate version confirmation so identical-looking and heading-only variants cannot silently use the wrong key. Add those controls to the independent holdout, broaden the family count, and measure the smallest passing candidate in offline iPhone Safari before requesting acceptance. A flexible whole-page warp remains an option if residuals within a block justify it.
