# M2 physical evaluation and iPhone walkthrough

Use [the synthetic development preview](https://ccheng.github.io/talus-scree-mark/) and mock sheets only. Record the build shown in the app, iPhone model, iOS version, test date and mode. This procedure can be printed with the reference PDFs. A quick check establishes whether the basic workflow works on the phone. The independent physical benchmark needs the separate sample and labels described below.

## Materials

| Material | Use |
| --- | --- |
| [Blank reference sheet](https://ccheng.github.io/talus-scree-mark/reference/reference-blank.pdf) | Print and mark distinct mock sheets. |
| [Filled reference sheet](https://ccheng.github.io/talus-scree-mark/reference/reference-filled.pdf) | Print for a known-answer camera check. |
| [Filled reference image](https://ccheng.github.io/talus-scree-mark/reference/reference-filled.png) | Save to Files for a known-answer image-import check. |
| [Filled reference key](https://ccheng.github.io/talus-scree-mark/reference/reference-key.json) | Compare MC states, exact NR slots and literal strings. |

Print on white US Letter paper, portrait, single-sided, at **Actual Size** or **100%**. Confirm the full sheet and all printed marks are visible. Record printer, paper, scale setting and marking instrument when running the benchmark. Keep the sheet ID on the reverse or in your log, away from the registration and response areas.

## Quick iPhone check

1. Open the preview in Safari while online and wait for **Offline ready**. Save the filled PNG to Files before the offline test.
2. Choose **Open camera** and photograph the printed filled sheet. Include the entire page, hold the phone steady and keep glare off the paper. Tap **Read bubbles** and compare each MC and each four-position NR observation with the key. Inspect the outlines on the image and verify they point at the expected rows and grids. Read any review reasons in the results table.
3. Tap **Choose image**, select the saved PNG and tap **Read bubbles**. Check the same key. Retake or clear and confirm the previous results disappear.
4. On a separate blank print, fill two choices on one MC row and leave another deliberately blank. Verify the double mark goes to review and the clear blank stays distinguishable. Then photograph a sheet with a corner registration mark outside the frame. Expect a retake with no accepted answers.
5. In Safari, use **Share → Add to Home Screen** and enable **Open as Web App** if shown. Launch from the Home Screen and let it become **Offline ready**. With Wi‑Fi and cellular off, quit and reopen. Repeat a known-answer capture or import and a retake case while offline. Also test offline reopening in Safari after its own cache is ready.

If the preview shows an earlier build, close the Safari and Home Screen copies, reopen online and allow the new release to finish caching. Record the exact build you tested. Report discrepancies with item IDs, the observed and expected states, and the lighting or framing condition.

## Ground truth and independent physical benchmark

1. Prepare approximately 30 distinct printed mock sheets for the standard set. Create answer patterns before reading the sheets with the app. Include all MC choices, marked and clear-blank items, zeros, decimal placements and both full and shorter NR strings. Keep purposeful erasures, convincing double marks, glare or damage in a separate stress set.
2. Give each sheet a stable anonymous ID. Record the intended choices, then inspect the physical page independently to label what is actually visible. Store MC choice or state and NR as four ordered symbols/states. Use `null` for a clearly blank slot, preserve literal spaces in complete strings, and distinguish a blank from ambiguous, multiple or unreadable evidence. Two readers independently label borderline marks and adjudicate before inspecting software outputs.
3. Freeze the build, profile revision, acceptance conditions, fixture assignments and answers before scoring. Select one standard capture per sheet per predefined mode. Keep all recaptures, rotated views and derived files with their original sheet, writer and capture session. Keep the sealed fixture files outside the public repository. Use a separately designated reserve for any post-fix reassessment.
4. Record every planned item, including items lost to a whole-sheet retake. Log the registration outcome and reason, per-item output, expected disposition, timing, and whether a wrong result was accepted silently. Record automatic coverage, silent error among accepted items and silent error among all planned items separately for MC and NR. Report sheet, writer, session, image and item counts and the uncertainty method. A device workflow check and a physical recognition benchmark provide different evidence.

Use this record format in a local spreadsheet or notebook. Slot arrays preserve positions even if a spreadsheet trims whitespace.

| Sheet / capture / writer / session | Mode and condition | Item | Ground truth and disposition | App observation and disposition | Silent error? | Analysis time or retake reason |
| --- | --- | --- | --- | --- | --- | --- |
| Example S01 / C01 / W1 / T1 | Safari, standard | NR sample | `["5",".","3",null]`, accept | `"5.3 "`, accepted | No | Record measured time |
| | | | | | | |

Device-dependent acceptance remains pending until the corresponding physical evidence is recorded. See the [M2 specification](MILESTONE_2_SPECIFICATION.md) for alignment, rejection, uncertainty and latency gates.
