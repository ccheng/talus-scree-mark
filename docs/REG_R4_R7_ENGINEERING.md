# REG-R4–R7 engineering evaluation

Shadow-only candidate based on the [frozen PSA handoff](https://github.com/ccheng/talus-scree-mark/blob/7cbbe41f33f661980c6719e4ee599bcb8d259544/research/psa-registration-r4-r7/REG-R4-R7-HANDOFF.md). Established registration, recognition, review, and hard exclusions are the only runtime decisions. The branch never returns a whole-sheet compatibility verdict. NR identity remains a separate research problem.

## Candidate

- Version 2 enrollment bounds the search for aligned header ink above the first response row. It searches both sides for coherent question-number windows and leaves the number group unenrolled if both sides qualify. A bounded correction preserves the earlier header windows when the adaptive locator fails to enroll a group, with window provenance in diagnostics. These windows locate ink. The number and symbol identifiers come from the profile, with no OCR identity claim.
- A separate print sampling matrix uses uniquely associated measured rings and a held-out anchor subset. It bounds residual displacement, local Jacobian and extrapolation over the checked glyph windows. The Established matrix is retained wherever support fails, and the result includes uncorrected comparisons and fit diagnostics. The mismatch operating point is unchanged.
- A residual ring search can detect translated, near-horizontal sequences of three to eight observed choices without requiring enrolled lanes. Ambiguous overlaps remain visible. The reference inventory distinguishes newly observed, previously observed unclassified, and missing footprints. Only an independently observed row with explicit teacher confirmation and a containing exclusion can be classified as a known excluded row under the earlier scope policy. Pixel-equivalent decorative rings can appear in the inventory.
- Version 1 evidence still uses the earlier path. Existing app shell, registration, grading, and published preview are outside the branch.

## Verification design

The ISTE independently reproduced the four frozen Node scripts and matched all 182 committed authored result records. It then replayed the exact original 36 synthetic photographs through 71 auto and manual paths, plus a separately authored and sealed reserve of 24 test photographs from three unfamiliar forms. The reserve was kept out of the repository and comparator tuning. The sealed manifest has SHA-256 `80f6b17b791be7938402084ad95a01ed4a84b7e28226246b92a811ff3f1042c9`.

All 118 replay and reserve paths preserved Established output byte-for-byte against the pinned deployed source. All eight guards and 77 Node tests passed. Guards cover mirrored images, multiple sheets, wrong batch, legacy, corrupt, misplaced and stale evidence, and v1 evidence. A loaded Chromium session also exercises JPEG decoding, enrollment serialization and evaluation offline. The unchanged control produced zero flags and the changed-header control flagged the target, with zero network requests and exact Established output. Installed PWA cold start and physical iPhone remain untested.

## Findings and PSA referral

| Original print cases | Prior shadow | Final candidate |
|---|---:|---:|
| Header enrollment | 19/23 | 23/23 |
| Question-number enrollment | 20/38 | 38/38 |
| Header changes flagged (auto / manual) | 4/6 / 4/6 | 4/6 / 5/6 |
| Number changes flagged in each mode | 0/3, all unavailable | 2/3 |
| Unchanged sites flagged (auto / manual) | 3/143 / 8/143 | 10/210 / 13/210 |

The adaptive-only candidate enrolled 9/23 original headers. The final fallback restored coverage while retaining the number gain. Sampling correction reduced unchanged manual flags from 16/210 to 13/210 on the same references, with no reduction on automatic paths. On the reserve, three of four changed header sites and one of two changed numbers flagged in each mode. The dense reserve family still had 0/19 defensibly enrolled print sites. On two sampled intact manual reserve sheets, the correction reduced false flags from 11/40 to 0/40. The automatic comparison stayed at 5/60.

Reserve structural dispositions matched 5/11 automatic and 7/11 manual cases, versus 3/11 and 5/11 with the prior shadow. False geometry-consistent outcomes fell from three to one per mode. These scores evaluate agreement with structural ground truth under bounded observation. They confer no grading authority.

- The original shifted and distant additions now yield actual measured footprints and both are flagged. The original structure cases matched 5/12 automatic and 12/12 manual dispositions. Seven automatic cases had no trusted pose. No spurious bands on available original structural paths. The rotated, known-exclusion case still needs a trusted pose.
- Off-lane two-choice rows remain outside the residual search. An enrolled two-choice lane can supply local evidence. Closely spaced mixed-count rows appeared on cleaner reserve captures but were unresolved in the low-resolution capture. No coverage claim follows from an empty or ambiguous result.
- The exact original condensed B→K change still agrees with the frozen comparator even with the oracle print window and oracle pose. The exact oblique and low-resolution unchanged controls still produce mismatch flags. Three original damaged-print targets flag mismatch even after known window and pose are supplied. Use independent appearance or teacher evidence to distinguish erasure and substitution. Moving the threshold alone cannot separate these controls.
- For next research, replay the sealed open glyph controls with fixed windows and pose to separate sampling from likeness, then test printed and erased versions of the same single-site change. Keep unseen reserve families independent. For structure, score individual ring visibility and competing row associations on off-lane two-choice and close mixed rows. Include paired text-like rings and resolution controls before interpreting a geometric difference as an actual response row.

**Disposition:** Keep shadow-only. Differences help localize what a teacher may inspect. Neither a mismatch, a bounded footprint result nor silence authorizes grading.
