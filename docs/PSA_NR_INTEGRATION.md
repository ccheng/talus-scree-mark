# PSA structured Alberta NR discovery

Application release `47cd5f2f8503992c0372dd78` incorporates the native runtime
from PSA commit `83a0e5645233fbb57ba28568f58c28f4562f6593` on the Classroom
recovery baseline. The [research branch](https://github.com/ccheng/talus-scree-mark/tree/research/psa-nr-structured-inference/research/psa-nr/portable)
contains the Python reference, cross-language evidence, and model reproduction
instructions. The application ships the JavaScript runtime and the original
8,336,736-byte synthetic SVM. The shell precache and a pinned worker SHA-256
verify the model independently of one another.

## Compare the options

In the blank template editor, choose Numerical response and draw a box around
one Alberta NR question, including its writing boxes, decimal bubbles and digit
rows. Choose Established or PSA structured under NR discovery, then click Find
Alberta NR bubbles. Compare the overlay with the printing. To try the other
option before confirming, cancel the block edit, redraw the same box and switch
the selector. Established remains the default and handles whole-page discovery.
Four-tap recovery and individual edits are available in the same editor.

Both options ultimately save the same profile geometry. The PSA worker finds and
verifies printed structure using box and decimal proposals, affine lattice
hypotheses and HOG/SVM digit-sequence evidence. The completed-sheet reader,
registration, keys, grading and backups use the existing code and profile format.
The worker is cancellable, has a search budget and timeouts, and terminates after
each search. Static assets come from the app's origin on installation or update
and support local processing after the app reaches Offline ready.

## Verification

For the first preview (`ed1b640bbcafaed281a82e6c`), the Independent Software
Test Engineer prepared and froze seven synthetic
photographic pages, then used the real editor in desktop Chromium with an
iPhone viewport and the network disabled after cache installation.

| Check | Observed result |
| --- | --- |
| Valid bounded regions | 9/9 with all 42 positions confirmed, saved and reopened. All 378 positions persisted. Worst center error was 0.0445 of minimum bubble pitch. Valid search median 0.88 s and nearest-rank p95 1.39 s. |
| Incompatible regions | PSA declined swapped digits, a missing decimal, an outer decimal, a missing digit bubble and an MC-only distractor. Established proposed a complete grid for swapped digits and exposed missing positions for the two incomplete grids. |
| Mixed workflow | PSA proposed a reviewable NR region that the tester explicitly reviewed and confirmed. A separately posed capture scored 10/10. A second moved from 6/10 with two pending to 8/10 with zero pending after correction. Category totals, correction history, CSV and photo-inclusive JSON restore were verified. |
| Worker unavailable | Cancel, engine switch and editor close/reopen passed. A missing model and a one-bit change to the cached model each failed safely. The tester completed the block with Established while offline. All 24 observed requests in the corruption and fallback check were same-origin GETs with no HTTP server arrivals. |
| Classroom regression | 38 synthetic classroom scans, interruption recovery, batch isolation and photo-inclusive backup and restore in desktop Chromium. |
| Automated regression | 65/65 passing Node tests and reproducible shell metadata (`npm test` and `npm run check:release`). |

The initial integration inherited size limits relative to the raster width. A
tight crop therefore rejected correctly sized components. The correction keeps
those extraction limits relative to the paper while processing only the selected
region. The product checks for a distinct outline at each of the 42 positions
and declines proposals with positive evidence of an incompatible digit order.

Physical iPhone Safari camera, timing and memory validation are outstanding.
The model adds about 8 MB of cached app assets. A valid low-contrast, unusual or
incomplete grid may still need Established or four-tap recovery. This evaluation
does not establish general accuracy or a field false-acceptance rate.

## Existing reference compatibility

The first preview reproduced an inherited compatibility defect in the
fixed-reference reader. The release restores the M2 coded reference's literal
leading-zero behavior. Grading with a markerless Alberta profile still sends
unnecessary leading zeros to review and preserves the literal observation.
The Independent Tester reran all four M2 browser acceptance groups (20/20
clean-sheet oracles and 46 total fixture cases) and the offline mixed PSA workflow
on the corrected release. The M3 assertions now explicitly distinguish an
exact literal observation from its required markerless format review.
