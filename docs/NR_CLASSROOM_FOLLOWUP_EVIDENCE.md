# NR and classroom batch follow-up evidence

The reference builds are MC `eda8c3a2` and mixed `f0ecaee1`.
The deployment paths and application code are unchanged by this record.

## Stage 10. Local registration controls

The earlier independent reserve had 8/16 automatic NR observations and
14/16 with oracle page corners matching the expected literal and review
state. That result shows sensitivity to the sampling pose. It does not
identify local block error, page-edge estimation, or a marginal printed-glyph
score as the dominant mechanism.

This follow-up read the exact mixed source and the versioned synthetic
interleaved pair, warped the blank and completed image with three known
perspective transformations, and registered each image with automatic and
oracle corners. The candidate local translation used separated fit and
held-out bubble outlines. All 12 registration paths passed. All 36 NR
observations were unchanged by translation. In one automatic pose, the
local fit reduced the held-out outline error from about 0.21 to 0.07 paper
points while increasing the median error against the transformation
oracle from about 0.17 to 0.64 source pixels. Some already accurate manual
poses also acquired a systematic offset. A separate injected shift sweep
at -1.5, -0.75, 0, +0.75 and +1.5 source pixels in both axes changed
none of the NR reads in this one public pair.

This control uses one form and synthetic transforms. The independent
difficult reserve was inaccessible after the workspace became unavailable.
The results do not support enabling the local translation in the app.

## Stage 11. Compact blank-reference hypothesis

The experiment quantized per-bubble interior darkness to four bits per sampled
location, then looked for added ink on locations that the blank reference
showed as predominantly paper. Its conservative combination with the original
reader kept original reviews and sent disagreements to review.

The Independent Tester specified nine cases before seeing candidate output.
They used the public interleaved form and varied subpixel translation,
contrast, shading, printed-only interior ink, pen, graphite, weak pencil,
erasure, two selections and malformed leading zeros. The current reader and
the standalone research method agreed on eight. Only the printed-ink-only
blank differed: the current reader sent it to review and the reference method
classified it blank, as expected. Both reviewed the weak pencil and two
selections. The conservative combined method kept the printed-only case in
review. These are synthetic mark-reader controls, with known sampling poses
and one printed template. Since there is no independent real-photo evidence
supporting a safe override, the current reader remains in use.

## Stage 12. Classroom size logic check and audit

A logic-only replay used 32 records, 20 mixed items per record, one mixed
key and eight corrections. CSV produced 960 item and subtotal rows.
A photo-free JSON export parsed back to all 32 identical records.
Proficiency, outcome and intersection subtotal partitions independently
reconciled with the grade for each scan. Duplicate scan IDs and a modified
grade were rejected.

Independent source audit found that unsaved scans and their corrections live
in memory until explicitly saved. Reload does not resume the active batch.
CSV follows the selected batch, whereas JSON backs up all visible results and
saved keys. A photo still being prepared can block JSON backup. Large
photo-inclusive backups encode photos concurrently and assemble the entire
JSON in memory. The pinned paths share browser-origin grading storage.
Saved grades and source photos are committed together in a transaction.

The workspace was unavailable for a classroom-size browser run. Still to
verify are actual photo and storage use, scan and review effort, interruption
and batch resumption, photo-inclusive restore, and deletion safeguards on
iPhone Safari. Prior two-scan browser results do not establish classroom
capacity. No application change or release promotion follows from this
limited audit.
