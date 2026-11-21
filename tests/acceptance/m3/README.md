# Independent M3 acceptance

Generate the synthetic forms with `python3 tests/acceptance/m3/fixtures.py`. This uses Pillow and no application code. The forms are independently labeled, with candidate-independent printed words, MC-only and mixed/interleaved grids, choice maps, exact responses, name-field variations, and known page geometry for translated, scaled, skewed and rotated captures. The named safety cases include wrong printed identity with the same grids, clipped and mirrored sheets, a missing block, and clear double marks. The disposable output is ignored by Git.

Run `node tests/acceptance/m3/frozen-reference.mjs app` to verify accepted M2 reference compatibility inputs. Existing M1 and M2 workflows separately test their normal entry points when app files change.

The M3 workflow runs `node tests/acceptance/m3/browser.mjs "$PWD/app"` on desktop Chromium with the `TALUS_TEST_PLAYWRIGHT_PATH` pointing to Playwright. It verifies authoring, markerless recognition, saved revisions, and browser workflow. Counts and conservative review/retake outcomes are reported separately from silent errors. Desktop checks use synthetic inputs and desktop offline simulation. They do not establish real iPhone acceptance, recognition generalization, or physical timing.
