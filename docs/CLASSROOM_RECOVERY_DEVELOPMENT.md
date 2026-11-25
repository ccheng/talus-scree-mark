# Classroom recovery development preview

Build `fc07ccae54ea5a85fde1c2ba` combines automatic persistence and sequential
photo backup on a separate Classroom preview. The original MC-only and mixed
test builds remain pinned.

## Storage and recovery

The capture pipeline saves the working photograph in IndexedDB before
launching recognition. Once a sheet passes registration and recognition,
one transaction writes its grade and photograph and consumes its pending
capture. A retake leaves a pending photograph and creates no grade.
The grade UI distinguishes a saved result, a write in progress, and a
capture whose grade still needs retry. Existing correction, undo and raw
observation records remain separate. Deletion still requires confirmation.

The active batch checkpoint records the ID and exact template revision for
the current app path. A reload can resume that batch and reopen a pending
photograph. Explicit manual-corner re-reading of a saved sheet produces a
linked rescan so the original observations and corrections are retained.
Independent Chromium tests covered offline reload after an injected write
abort, resumption under the original capture and batch IDs, canceled and
confirmed discard, and rejection of duplicate or stale completion.

Classroom grades and pending photos use a dedicated database. This preserves
the previous previews' access to their own existing records and lets the grade
and capture commit together. Import a version 1 grading backup to transfer
saved grades. Profiles stay in the shared profile store. A grading backup
contains saved results and keys. Pending photographs are recovered on the
original device.

## Backup and restore

Version 1 JSON remains the external format. Export encodes one photo at a
time and assembles the download from separate Blob parts. Import streams
ordinary backups one record at a time, including checksum and grade
validation, then commits the verified bundle in one IndexedDB transaction
with one scan write queued at a time. The browser still holds the final
download Blob and verified restore records, so overall resource needs grow
with the number and size of photographs. A reformatted version 1 file
that orders scans before keys can use the compatibility parser up to 8 MiB.
Original exports already order keys first.

Independent Chromium tests restored a photo-inclusive backup from the
previous preview, including discarded-photo state and correction history.
A corrupt last photograph and an injected second-scan write abort each left
no partial data. A 1,024-byte Chromium origin quota override was surfaced
as a storage error and left no saved keys or results. Removing the quota let
the same backup restore offline with all three photo checksums unchanged.

## Classroom-size verification

The reusable Chromium test imported 32 synthetic 20-question mixed sheets
into one class and one sheet into another. The test closed and relaunched
the Chromium process offline after sheet 12 using the same browser profile.
It checked that one active batch retained all 32 sheets, both corrections
and the original malformed NR readings. The first class CSV contained its
640 question rows and excluded the other batch. A fresh profile restored
all 33 records and photograph lengths from the local JSON export.

On this host, file selection through durable grade acknowledgement took a
median of 953 ms and ranged from 872 to 1,196 ms. The 32 photos used
107,152,648 bytes. The origin reported 177,677,364 bytes of storage usage
after the first class. Exporting the 149,827,234-byte backup took 9,980 ms.
The recorded restore took 17,765 ms. An earlier run under concurrent load
exceeded the test runner's 30-second deadline. Recorded Chromium JavaScript
heap snapshots were 3,278,420 bytes after enrollment, 26,968,448 after the
class, 4,745,556 after backup and 17,213,040 after restore. These are point
samples of JavaScript heap. The browser's full process memory and peak
native image memory were outside the measurement.

The independent run used 38 distinct synthetic sheets and four simulated
capture poses. It completed a 34-sheet class and a four-sheet second class
offline. At sheet 14, the tester reloaded after the photo checkpoint and
before recognition, then resumed the original capture ID. CSV exports
contained only their respective classes, and the 39,827,281-byte backup
restored all 38 photos with matching SHA-256 digests in a fresh profile.
The run recorded 369 exact item reads, 11 review flags, and no wrong
confident reads. On that workload, median capture-to-save was 985 ms,
backup generation was 2,352 ms, and restore was 16,705 ms. The run used
local static reads and sent no posted payloads.

Run from the repository root with Pillow and Chromium Playwright available.

```sh
node tests/acceptance/m4/classroom.mjs app
```

Physical iPhone Safari, mobile memory limits, and recovery after forced OS
termination still need device verification.
