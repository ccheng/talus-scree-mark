# Test fixtures

`synthetic-recognition-v1.json` contains hand-authored labels for a fictional sheet. Evidence entries identify synthetic page regions. The fixture contains no image, extracted student work, or personal data.

Each numerical-response label preserves four positions. `null` marks a position with no single selected symbol in these labels. The field status distinguishes a wholly blank response from ambiguity, multiple marks, or unreadability. A recognized string uses a literal space for an empty position and retains all zeros and decimal points. The labels express observed cells before any grading rules.

Evidence boxes are normalized page coordinates in `[left, top, width, height]` order, with the origin at the top-left. A correction references its original recognition run, field, and evidence. The original field continues to represent the original recognition result.

Run `npm test` from the repository root. It verifies fixture integrity using the built-in Node test runner. Accuracy, image processing, grading, and browser behavior require their own acceptance tests as those features are introduced.

Use synthetic fixtures by default. Record source provenance, generator version and seed where applicable, and expected labels independently of recognition output. Keep held-out evaluation assets out of development fixtures.

## Capture image fixtures

The synthetic `images/colored-corners` files have a 48 × 32 stored pixel grid. The top corners are red and green and the bottom corners are blue and yellow, respectively. The mirrored JPEG is progressive and has EXIF orientation 5, so the oriented image is 32 × 48 with red and blue on top and green and yellow below.

The fixtures were created in Pillow 13.0.0 by filling four 24 × 16 rectangles with `#e22222`, `#27a728`, `#2525e2` and `#e6bc23` in reading order. JPEG quality is 92. No random seed or source image was used. Node tests inspect the stored envelope and bounds. Browser comparisons can check upright pixel positions independently.
