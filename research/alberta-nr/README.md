# Structure-first Alberta numerical response discovery

This research prototype takes one bounded region and an already established
page pose. It looks for the four writing boxes, uses their centers to seed the
digit column axes, and verifies the two middle decimal bubbles and ten complete
digit rows. It publishes an observed grid only when it finds one unambiguous
42-bubble mapping. The current detector starts with the decimal bubbles and
recovers the digit rows from the printed outlines. Both use the same underlying
ring detector.

On eight existing synthetic development regions, both paths found all 42 centers
within half a bubble radius in every region. The first independent pass found
2/8 valid layouts with structure-first versus 5/8 with the current method.
A focused correction learns each separated writing box independently before
checking that the four align. The corrected method recovered the three
independent gapped layouts the current method already found.

The Independent Tester reran all original cases and added two valid gapped
captures and a gapped lookalike. Across both sets, each method found 7/10 valid
grids and denied 9/9 partial or wrong grids. The seven exact mappings had
294/294 correctly assigned centers with maximum error 0.147 bubble radii.
Both methods missed a dense shared strip, a faint shared strip, and one
roomy gapped layout with serif printing. The methods produced identical
centers on their accepted cases. Writing-box structure supplied useful
additional evidence but recovered no additional grids in this comparison.

This code is intentionally isolated from the app. The prototype depends on
visible boxes and the existing outline detector. Further research should use
box and row constraints to recover weak outline evidence, then measure whether
that improves valid discovery without mapping incomplete controls. No physical
capture or Safari performance claims are made.

Run `node research/alberta-nr/evaluate.mjs /path/to/manifest.json` with
Node and Python with Pillow. The JSON manifest has `page` (width and height
in points) and `cases`. Each case has `name`, relative `image`, four
ordered image-space `corners`, a page-space `region` with x, y, width, and
height, and `expected`. For valid cases `expected` contains 42 entries with
zero-based `slot`, literal `symbol`, and page-space x, y, and radius.
Use null for an invalid case. A complete grid passes only if every reported
slot and symbol maps to the expected center within half the reference radius.
Keep independent holdouts and school materials outside the repository.

## Local outline recovery experiment

The three shared misses began before lattice assembly. The shared component
extractor missed 5 correctly sized centers in the dense form, 3 (all digit 9)
in the serif photo and 13 in the faint form, including both decimal outlines.
All 24 radial sectors on each of the five dense and three serif failures still
had ink below the stronger global cutoff. A diagnostic using the existing
dense-interior mode recovered the five dense outlines but none of the other
missing ones. The faint outlines crossed the cutoff in only 17–23 of 24
sampled sectors, consistent with thin fragmented rings. Accurate known page
corners, region margins and measured center positions ruled out region
clipping or a gross pose error in these diagnosis cases.

The bounded experiment keeps the existing detector first. On an incomplete
grid it uses visible writing boxes, recurring candidate columns and mostly
observed rows to predict only where to look. It requires localized annular
contrast around each missing center, verifies both inner decimal outlines, and
checks for unexpected outer decimals and an extra digit row. No estimated center
is returned as a verified result. The three diagnosed forms were recovered
without accepting any of the eight original negatives.

The Independent Tester evaluated frozen local commit `e430d41` on five fresh
valid captures and five controls. Existing discovery mapped 2/5 exactly.
Outline recovery mapped 4/5 exactly, all 168 expected centers within 0.149
bubble radii. Both additional reads were independently transformed captures
of one bold-print layout. Both methods denied all five controls. A faint
separated-box form remained unresolved. This is research-only code. It does
not replace the existing detector or change the M4 app.

The same evaluation command prints `outlineRecovery` alongside the baseline.
