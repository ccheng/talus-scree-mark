# Synthetic profile examples

These fictional US Letter forms are for M3 profile setup and scan checks. The name and date lines are empty. Use only mock sheets with the development preview. Print at **Actual Size** or **100%**, or import the grayscale PNG directly.

| Layout | Blank | Marked example | Expected observations and geometry |
| --- | --- | --- | --- |
| MC only, 24 items in two columns | [PDF](mc-only-blank.pdf) · [PNG](mc-only-blank.png) | [PDF](mc-only-filled.pdf) · [PNG](mc-only-filled.png) | [Key](mc-only-key.json) |
| Mixed, 16 MC items followed by four NR grids | [PDF](mixed-blank.pdf) · [PNG](mixed-blank.png) | [PDF](mixed-filled.pdf) · [PNG](mixed-filled.png) | [Key](mixed-key.json) |
| Interleaved, 17 MC items and three NR grids | [PDF](interleaved-blank.pdf) · [PNG](interleaved-blank.png) | [PDF](interleaved-filled.pdf) · [PNG](interleaved-filled.png) | [Key](interleaved-key.json) |

Use each blank image to create and confirm its profile. The interleaved [same-grid lookalike PDF](interleaved-lookalike.pdf) and [PNG](interleaved-lookalike.png) retain the response geometry but change the printed identity. Verify the interleaved profile rejects this form. Scan the corresponding marked image using that profile. The interleaved example contains a five-choice MC block and an intentionally blank NR response. The keys preserve item order, exact four-position NR strings, and nulls for individual blank slots. Coordinates are US Letter points measured from the top-left. The keys are fixture oracles and are independent of app profile storage.

To regenerate the examples with Python 3.12:

```sh
python -m pip install reportlab==4.4.9 PyMuPDF==1.26.6
python app/fixtures/m3/generate.py
```

The PNGs are 1530 × 1980 pixels. The generator writes [SHA-256 digests](manifest.sha256.json) for its outputs. These public examples are separate from the Evaluator's independent holdout.
