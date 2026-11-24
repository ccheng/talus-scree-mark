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

## Alberta discovery correction

The tighter supplied form has an NR horizontal pitch of about 14.0 pt and an outer radius near 5.1 pt. The ratio is about 2.75, below the legacy three-radius spacing rule. The baseline selected cross-question grids and rejected the overlapping proposal. The customized PDF has pitches around 14.3–15 pt, a digit-row pitch near 11.85 pt and taller writing boxes. At the original sampling resolution, its first printed digit row did not survive intact as outer-ring candidates. The baseline proposed four nine-row MC grids in the NR area.

The Alberta path detects the two upper decimal outlines and ten successive four-column rows before general lattice selection. It estimates the horizontal pitch and digit-row spacing independently, uses higher-resolution outline evidence, and treats the writing boxes as supporting evidence. Generic MC grouping uses repeated spacing across blank group gaps to prefer true rows over letter-shaped heading candidates. The app retains independent proposals when other regions conflict and marks the layout for review. A manually selected Alberta box uses the same detection. If it covers multiple NR questions, draw a tighter box around one, including both decimal bubbles. Individual grid correction remains available.

Recognizing the customized blank as a completed sheet also exposed dense printed zeros above the old blank-ink limit. The saved reference now allows a higher baseline only when the same digit repeatedly has dense ink across its slots. Mark-confidence and post-registration block verification thresholds are unchanged.

### iPhone retest

1. Open the synthetic development landing page in Safari and save the two blank and marked pairs to Files. Use a different profile name for each layout.
2. Import one blank. Review the proposal for MC1–9 on the left, MC10–14 on the right, four separate NR blocks, and no response overlay on either written area. Each NR block has decimal bubbles only in slots 2 and 3.
3. Save the profile, close and reopen the app, then select that profile again. Import the blank as a completed sheet once and check for clear blanks. Enter the six-item key on the development landing page and scan the corresponding marked sheet. Check the four NR observations `0.25`, `23.7`, `004 ` and four blank slots. The provisional score is 3/6 with one pending item, NR3.
4. Review NR3, record a credit decision, save the result and photograph, and reopen the record offline. Repeat with the other layout. The existing export and backup steps above also apply to these profiles.
5. For the manual fallback, use a fresh template draft, clear the proposal, select Numerical response and box one NR question including both decimal bubbles. Tap **Find bubbles in box** and check for 42 bubbles before confirming.

The supplied originals and any local rasters of them are excluded from GitHub. The public preview provides synthetic analogues. For an original PDF, first render or save its page as an image on-device. The camera-style fixture is a simulated perspective, blur and compression test. Physical capture, touch interaction and Safari/PWA storage checks still require the iPhone.

### Focused discovery correction

The previous simulated-camera build admitted a choice-heading row after an extrapolated spacing score selected a two-row suffix ahead of the complete observed three-row run. Lattice selection now compares directly observed cells first and uses repeated spacing to break ties. The two genuine right-column groups then join across the printed gap without pulling in the heading.

The previously passing M3 four-box form also exposed that ranking error. The Alberta path discarded its 37.43 pt upper decimal pair because it used a separate 30 pt pitch ceiling. The generic path then chose the nine-row suffix over the complete ten-row run. The Alberta path now shares the generic 45 pt ceiling. The digit-row spacing checks and requirement for all ten complete rows remain in force. The negative control removes the first or final digit row and checks that neither result can be proposed as complete.

### MC-only release slice with exclusions and categories

1. Import a synthetic mixed blank. Enable **MC-only grading**. On the rectified preview, draw a rectangle around the NR section and choose **Use box as exclusion**. Repeat for written-response areas. Edit or remove rectangles in the exclusion list. Mark any reviewed response blocks to keep before running **Find blocks outside exclusions**.
2. Check every MC row and its choice positions against the blank before saving the profile. Correct any partial row at setup. Exclusion boxes apply only to automatic template discovery. They do not crop the capture, remove a kept response mapping, or bypass registration on completed sheets.
3. Open the answer key and expand **Question categories**. Supply two different names and enter the values one per line. Update category choices. Assign a range for a contiguous block, assign to checked questions for a noncontiguous set, or override a single question in its row. Empty assignments appear as **Unassigned**. Categories belong to the saved key revision.
4. Scan a marked synthetic form. Check for **MC only · NR and WR excluded**. Check the overall keyed score and the category subtotals. Award or deny credit and check the updated provisional count and subtotals. Save the result, reopen it offline, and run an explicit rescan. CSV includes item rows and tagged subtotal rows. JSON preserves category assignments, revision references, grades, and the retained photograph.

### When discovery is incomplete

**Kept** blocks stay mapped during rediscovery. **Replaceable on rediscovery** blocks stay visible until the next search, when they may be replaced or dropped. **Remove** deletes a block from this draft immediately. Add or replace a missing region by drawing a box, setting its question and choice counts, and finding the printed bubbles or placing a grid from its endpoints. Fix any duplicate identifiers using the inline block list and starting-number controls. A failed confirmation leaves the proposed grid open.

Review discovery's preserved, newly found, replaced and removed counts. Acknowledging a warning leaves coverage unconfirmed. Compare the overlay with the sheet and select **All intended MC questions are mapped** after repair, or **Save only the mapped MC questions** if the subset is intentional. Partial results and CSV retain that distinction. Confirmed profiles still require registration and response-geometry checks on each capture.

### Fit a multiple-choice block

In MC-only setup, enter an optional expected question count to check coverage. For incomplete discovery, draw a tight rectangle around one group of bubbles. Enter its questions, choices, and first question number, then select **Fit MC block in box**. The fit follows observed row positions even when there are printed gaps between groups. Matching positions from released prior proposals are retained. Orange positions are estimates based on the observed row and column and require explicit review. Confirm the block to replace any proposals named in the fit summary. Kept blocks must first be released if they need replacement.

If a whole row has insufficient outline evidence, fit a smaller region or use the advanced endpoint controls. The expected count can catch omissions but cannot verify identifiers or geometry. Compare the overlay with the sheet before final confirmation. A count mismatch can be saved only with an explicit partial mapping.
