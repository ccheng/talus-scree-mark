# Independent M1 desktop acceptance

This suite runs Chromium against a disposable localhost fixture server at the GitHub Pages-style subpath. It covers worker scope, failed installs, staged updates, offline reopening, keyboard and layout checks, image decoding and orientation, camera simulation, request observation and browser storage. Actual iPhone behavior is a separate gate.

From the repository root with Python, Pillow and Playwright installed, run `python3 tests/acceptance/m1/fixtures.py` and then `node tests/acceptance/m1/browser.mjs "$PWD/app"`. Set `TALUS_TEST_PLAYWRIGHT_PATH` to the installed Playwright module's `index.mjs` when it is outside the normal import path, or use `TALUS_TEST_CHROMIUM` to select a Chromium executable. Run `npx playwright install chromium` to install the Playwright browser when using a normal npm installation.
