# Test fixtures

`synthetic-recognition-v1.json` contains hand-authored labels for a fictional sheet. Evidence entries identify synthetic page regions. The fixture contains no image, extracted student work, or personal data.

Each numerical-response label preserves four positions. `null` marks a position with no single selected symbol in these labels. The field status distinguishes a wholly blank response from ambiguity, multiple marks, or unreadability. A recognized string uses a literal space for an empty position and retains all zeros and decimal points. The labels express observed cells before any grading rules.

Evidence boxes are normalized page coordinates in `[left, top, width, height]` order, with the origin at the top-left. A correction references its original recognition run, field, and evidence. The original field continues to represent the original recognition result.

Run `npm test` from the repository root. It verifies fixture integrity using the built-in Node test runner. Accuracy, image processing, grading, and browser behavior require their own acceptance tests as those features are introduced.

Use synthetic fixtures by default. Record source provenance, generator version and seed where applicable, and expected labels independently of recognition output. Keep held-out evaluation assets out of development fixtures.
