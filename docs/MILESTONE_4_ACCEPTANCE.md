# M4 acceptance

The Product Owner approved the consolidated M4 requirements. Where the earlier proposal differs, these rules apply.

- Grade one point per keyed item. Unkeyed items stay outside the denominator. Pending items contribute zero provisionally, and the numeric score and pending count remain visible. The NR grader validates Alberta entry rules before exact decimal comparison. For example, 7.00 and 7 are equivalent valid values. 004 is held for review.
- Keep raw observations, literal NR slots, and decisions separate. Keep the previous result when rescanning. The teacher confirms the same physical sheet and separately decides whether to reuse corrections. Regrading requires a compatible key and an explicit action.
- Save a result and a lossless PNG of the exact recognition pixels in one local transaction. Images are retained at the app's working resolution. Delete a photograph independently or delete the result/batch. Safari can clear site storage.
- CSV exports the selected batch with grade and review status. JSON version 1 is an on-device backup with key/template-revision references, raw evidence, corrections and embedded checksummed PNGs. Import validates the backup before an atomic restore, and conflicting records abort insertion. Existing identical keys can be shared. The backup contains the grading template mappings required to reopen and regrade results; it does not change the bank of scan templates.
- Test source images stay synthetic. The current workflow grades enrolled templates. The coded M2 reference is retained as a scan-only regression path.

## Physical iPhone acceptance

1. In the development preview enroll the mixed or interleaved synthetic blank, select it and edit its answer key. Leave one item unkeyed. Scan the corresponding filled sheet. Check the score, denominator and pending count.
2. Use the Alberta synthetic fixture to exercise a leading-zero or ambiguous response, and check the provisional score. Explicitly award or deny credit, correct a response, and undo an action. Verify the score updates and original observation stays visible.
3. Save a result, close the app, reopen it offline and retrieve the photograph. Save a second scan and explicitly rescan the first. Check scan labels, the existing record, and confirmed reuse of corrections.
4. Export the selected batch as CSV and make a JSON backup. Tap the generated download links and save them to Files. Inspect CSV status and numeric totals.
5. With the backup safely downloaded, delete the test results and restore the JSON file. Reopen the restored record and photo, correct it, regrade, then export again. Try restoring the same file a second time and verify existing records are intact.
6. Delete one photograph while keeping its result. Verify that its grade, history and key remain. Confirm the stable M3 preview is separate.
