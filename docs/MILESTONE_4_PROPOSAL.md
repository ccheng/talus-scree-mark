# M4 proposal — Review, grading and export

**Status** · Historical proposal. The Product Owner approved a revised scope. See [M4 acceptance](MILESTONE_4_ACCEPTANCE.md) for the operative rules.

- **Answer keys.** Enter and edit keys against a specific saved template revision. Use its item IDs and available symbols. Permit unkeyed items with explicit status. Key revisions are immutable after use in a graded record, and regrading against a newer revision is explicit.
- **Grading.** Run locally. Propose one point per keyed item. A verified blank is incorrect when keyed. Ambiguous or unreadable responses remain pending until reviewed. Unkeyed items stay outside the denominator. Show correct, incorrect, pending and unkeyed counts. Preserve literal NR slots in evidence. For grading, propose exact decimal-value comparison after stripping padding, so 004 equals 4 and 7.00 equals 7. Compare decimal strings without binary floating-point tolerance. Hold malformed or incomplete values for review when recognition reports uncertainty.
- **Review and correction.** Display observed values, review flags and effective answers. Allow validated item corrections and undo. Keep immutable recognition evidence and an explicit correction record. Rescans record new raw observations and require an explicit choice before reusing corrections. Retake results never become gradeable records.
- **Persistence.** Store keys, scan results, corrections and grade provenance locally in IndexedDB, tied to template and key revisions. Keep images transient for M4. Verify safe reopen and deletion, explicit write errors and compatibility with existing M3 profiles. Keep previously saved records usable when a write fails.
- **Export.** Export one batch as review-friendly CSV and versioned JSON. CSV includes item status and raw/effective values, quotes fields and neutralizes spreadsheet formula inputs. JSON preserves exact slot strings, key/template references and correction evidence. Exports stay local, with a physical iPhone Files/share check.

## Proposed acceptance criteria

Use independent grading oracles covering invalid or partial keys, clear blanks, ambiguous items, exact decimal equivalence and precision differences, and zero keyed items. Verify correction/undo, explicit regrade, rescan and reopen preserve prior evidence and revision links. Verify deletion, quota/write failure and compatibility with pre-existing profiles. Parse CSV and JSON against expected contents, including leading zeros, quotes, line breaks, formula-like text and explicit pending/unkeyed statuses. Run existing M1–M3 regression suites, including cropped-margin, Alberta NR and batch/offline behavior. Confirm no image, key or result uploads and run a synthetic iPhone workflow through local export.

Approval requested for the proposed NR equivalence, one-point grading and transient-image scope. Weighted scoring, handwriting inference and classroom pilot deployment are outside this proposal.
