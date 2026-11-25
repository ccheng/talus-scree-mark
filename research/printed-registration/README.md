# Printed landmarks for MC registration

The app's block-level search can accept a grid that moved independently of the
sheet. This experiment compares those block corrections with local motion of
fixed printed rules, corners, and junctions. It uses rectified grayscale
patches, a local uniqueness check and two conflicting landmark observations
in a block before it vetoes the baseline. Where the evidence is sparse it
defers to baseline. It does not change the app or its detection thresholds.

On two independently authored synthetic holdout families, 16 valid paths
and 20 wrong-layout paths each included automatic and manual registration.
The preview accepted 16 valid and 12 wrong paths. Printed corroboration
retained all 16 valid paths and accepted 4 wrong paths. One family showed
4 of these wrong accepts because each shifted block had only one separately
localized contradiction. A true opposed curl also produced a single
contradiction, so treating every single contradiction as definitive would
discard valid evidence. The stage-one paired-capture regressions separately
showed 4 valid accepts and 4 subtle wrong accepts in the baseline.

This offline desktop diagnostic requires the blank raster and its corners.
The browser implementation would need to enroll and store compact landmark
evidence alongside the existing geometry, handle profiles without such
evidence, and be tested fresh on unchanged valid and wrong layouts. This
study provides no Safari performance measurements or physical Physics-pair
diagnosis. The development preview remains build `99e32750`.

To reproduce with an external synthetic case set, install Pillow, NumPy and
opencv-python-headless. The manifest contains `profile` (a full markerless
profile), `blank` (relative image path), `blankCorners` (the four ordered
image-space points), and `cases`. Each case has `name`, `image`, `valid`,
`scanCorners`, optional `answers` keyed by item ID, and optional `centers`
keyed by `ITEM:CHOICE`. Run from the repository root.

```sh
node research/printed-registration/trace.mjs app /path/to/manifest.json > /tmp/print-trace.jsonl
python research/printed-registration/landmarks.py /tmp/print-trace.jsonl
```

Keep independent held-outs and school materials outside the repository.
