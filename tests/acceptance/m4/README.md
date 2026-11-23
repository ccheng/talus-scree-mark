# Independent M4 browser acceptance

Generate the synthetic portfolio fixtures with `python3 tests/acceptance/m4/portfolio-fixtures.py` and run `node tests/acceptance/m4/browser.mjs "$PWD/app"` using desktop Chromium and Playwright. The GitHub workflow pins Pillow and Playwright.

The two portfolio layouts model Letter forms with nonuniform MC row gaps, a dense bank of adjacent Alberta NR blocks and two large written areas. The document geometry comes from vector writing dividers and raster bubble landmarks at 144 dpi. The camera geometry uses independently measured bubble groups normalized to Letter points and a reproducible additional mild perspective transform. Sources and rendered copies of the supplied documents stay outside Git. The generated forms have original synthetic text, marks and working strokes.

Both fixtures go through template discovery, save, reload, key entry, blank capture and marked capture. Tests compare all 18 literal observations, saved IDs, bubble geometry and the provisional grade. Printed glyphs by themselves must yield clear blanks. Written content supplies no graded observations. The selected-region control rejects a box spanning four NR questions, identifies one 42-bubble block in a tight box and reads its exact answer after save.

The existing offline tests retain independent grading, lossless photograph, queued write failure, CSV, JSON restore and deletion checks. These are Chromium tests using synthetic inputs.
