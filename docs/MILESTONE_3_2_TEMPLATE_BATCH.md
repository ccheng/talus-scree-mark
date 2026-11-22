# M3.2 teacher-confirmed template batches

The teacher confirms a saved blank-sheet profile revision for a batch of completed copies, ordinarily from the same print run. The profile defines the response geometry and mapping. Completed sheets supply observations and never change the map. When grading is available in a later milestone, the teacher also selects the key.

## Acceptance

- Confirm a profile revision once and keep it selected for successive scans. Changing profiles or revisions requires confirmation before recognition. Clear results from the previous batch when the batch changes.
- Align with page geometry, bubble outlines and, where helpful, stable printed features. Exclude names, variable handwriting and response interiors from fixed-feature matching. A heading change alone cannot authorize or block a read. Preserve automatic grid proposal, parametric calibration and individual bubble correction.
- Verify the location, visibility and structural support of every expected MC and NR block, including rows and slots. A missing, clipped, incompatible or displaced required block triggers a retake with zero accepted items. Manual corners pass the same validation. Unresolved orientation cannot emit accepted items.
- Read deliberately unmarked bubbles as blank when supported by visible outlines and reliable alignment. Local unreadable marks and obvious doubles remain item review when the enclosing geometry is verified.
- Before reclassifying fixtures, independently verify invariant physical geometry, item order, choices and NR slot semantics. Use confirmed compatible heading and incidental-print variants as paired positives. Keep mapping differences in structural or teacher-selection controls according to what the image can establish.
- Run the existing M1 and M2 suites and the markerless authoring, persistence, consecutive-scan, offline and network privacy flows. The M2 coded reference remains a compatibility control.
- Score the frozen candidate on privately checkpointed synthetic reserve families. Report intended items, automatic coverage, wrong automatic responses, exact sheets, retakes and displacement, grouped by layout and source. Report cross-renderer diagnostics separately. No physical performance claim follows from synthetic measurements.

The Independent Tester owns public acceptance oracles. The Research Evaluator holds the reserve independently. After one bounded correction and focused retest if needed, record disposition. Publish the exact candidate to the synthetic Pages site only after its independent automated gates pass. PR #7 requires separate Product Owner approval to merge.

## iPhone acceptance after publication

Use the [automatic discovery checklist and directly linked fixtures](#automatic-template-discovery-acceptance) when testing the discovery build.

1. In Safari, open the synthetic preview and verify the reported build. Save a supplied mock blank PNG and print its matching PDF at actual size.
2. Enroll the blank, confirm corners, and verify the item, choice and slot mapping. Try automatic grid proposal and parametric adjustment, and correct one bubble if needed. Save and confirm the profile once for the batch.
3. Photograph several mock copies from the same print run. Include one unmarked answer, one dark single mark, one obvious double, and one erased mark. Check exact MC/NR order, clear blank handling and review states. Try modest rotation and tilt and verify the selected revision stays active.
4. Clip a required block and try a printed form with a different grid. Expect a retake without accepted answers. Then capture a valid sheet and verify recovery in the same batch.
5. Add the app to the Home Screen, let it finish caching online, enable airplane mode with Wi-Fi off, and reopen it. Reconfirm the stored profile if prompted and capture a new mock sheet offline.
6. Record iPhone model, iOS version, build, Safari or Home Screen launch, observed outcomes, retries and setup time. Score the representative physical benchmark separately from this functional checklist.

## Automatic template discovery acceptance

Start from the [synthetic preview](https://ccheng.github.io/talus-scree-mark/) and make sure the build matches the acceptance report. Use the M2 coded reference with its built-in profile. For each M3 layout, import the blank PNG to create a profile and scan the matching filled example after saving. Print PDFs at actual size for camera checks.

| Mock answer sheet | Blank | Filled | Expected answers |
| --- | --- | --- | --- |
| M2 coded reference | [Print PDF](https://ccheng.github.io/talus-scree-mark/reference/reference-blank.pdf) | [Import PNG](https://ccheng.github.io/talus-scree-mark/reference/reference-filled.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/reference/reference-filled.pdf) | [Key](https://ccheng.github.io/talus-scree-mark/reference/reference-key.json) |
| M3 MC only | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mc-only-blank.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mc-only-blank.pdf) | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mc-only-filled.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mc-only-filled.pdf) | [Key](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mc-only-key.json) |
| M3 mixed MC and NR | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mixed-blank.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mixed-blank.pdf) | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mixed-filled.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mixed-filled.pdf) | [Key](https://ccheng.github.io/talus-scree-mark/fixtures/m3/mixed-key.json) |
| M3 interleaved MC and NR | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/interleaved-blank.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/interleaved-blank.pdf) | [Import PNG](https://ccheng.github.io/talus-scree-mark/fixtures/m3/interleaved-filled.png) · [Print PDF](https://ccheng.github.io/talus-scree-mark/fixtures/m3/interleaved-filled.pdf) | [Key](https://ccheng.github.io/talus-scree-mark/fixtures/m3/interleaved-key.json) |

1. Start timing when you select the blank PNG. Verify that one overlay appears with page corners, all MC rows and the four bubble columns of each NR answer. Where the form has four writing boxes, check that they appear over the correct slots.
2. Compare the proposed numbering, choice order and each NR column’s symbols against the print. Review the flagged conventions, correct any mapping at block level and save. Stop timing at successful save.
3. Record time to overlay, total setup time, and counts of manual corner placements, region draws, row or column entries, individual bubble edits, block mapping changes and retries. Expect zero manual geometry interventions on the three standard sheets.
4. Confirm the saved profile for the batch and scan the matching filled example. Compare every MC selection and NR slot against the key. Repeat one setup and scan offline after the app has cached.
