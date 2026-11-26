# Whole-page PSA Alberta NR discovery

Build `a6336153135e073e78b4607e` adds **Find all blocks with PSA NR** to the
blank-template editor. Import the blank sheet, let Established discovery
finish, then use this action to search for all response blocks in one pass.
If the editor cannot establish the page pose, adjust its corners first. No NR
boxes have to be drawn for this search. Whole-page Established discovery and
the bounded Established and PSA options remain available.

The editor uses the existing page pose and general layout discovery, then
rectifies the page for the same local PSA worker used by bounded discovery.
It replaces equivalent numerical blocks once, admits new verified proposals,
and protects kept blocks, exclusions and overlapping MC proposals. A localized
incompatible PSA result can withhold the corresponding Established NR proposal.
When a usable PSA proposal requires review, its rings are orange and saving
requires the teacher to acknowledge the review. Failure to load or run the
worker displays the Established layout and offers bounded recovery. Canceling
preserves the prior draft. Both paths use the same saved profile format and
completed-sheet registration and grading.

## Independent browser evidence

The tester exercised the actual editor with seven held-out synthetic pages
and two supplementary mixed layouts in desktop Chromium. In the seven-page
comparison, nine valid NR grids mapped and saved with a maximum center error of
0.047 times the minimum bubble spacing. One grid was newly recovered where
Established had proposed no blocks. Eight relied on PSA geometry at the same
locations as Established. None of the five incompatible regions produced an
NR mapping. The new action withheld three incorrect Established NR proposals
on the semantic controls. A separate MC lookalike was also withheld as NR, and
the neighboring genuine NR grid was recovered.

The tester verified review and save, reload, editing a stored revision,
renumbering, a kept MC block, exclusions, MC-only mode, cancellation and
model-unavailable fallback. Median elapsed time was 6.4 seconds online
(seven searches) and 7.8 seconds offline (five searches). The observed ranges
were 5.9–6.9 and 6.9–9.4 seconds respectively.

On the final build, after resolving the conflicting MC proposal and recovering
NR2 with a bounded fit, the tester graded a separate synthetic capture at
10/10. A second capture went from 6/10 with two pending reviews to 8/10 with
none pending after correction. Category subtotals matched the expected values.

## Remaining limitations

On a supplementary mixed layout, Established classified two digit rows as MC.
The PSA pass preserved the conflicting MC proposal and showed a warning. In
this case, remove the spurious MC proposal and recover the NR grid with a
bounded fit. Similarly, the MC lookalike's true MC rows still require manual
MC mapping. Review the complete overlay and numbering before saving.

Whole-page searching uses more time and memory than one bounded search. The
model remains unchanged, and the worker search budget and timeout still apply.
Physical iPhone Safari timing, memory and camera validation are outstanding.
