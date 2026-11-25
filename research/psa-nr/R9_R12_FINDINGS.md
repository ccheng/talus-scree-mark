# PSA R9–R12: header-led whole-page discovery and alternative lattice hypotheses

2026-11-25. Research only; PSA self-evaluation. No app, previews, PR #8 or production changes. Owner authorized sequential R9–R12. Reopened R5–R8 archive and Mini-Charter v4. Frozen R6 semantic verifier and earlier page blob/decimal generators reused.

## R9
Directional morphological opening and closing at two image-relative scales, Otsu and adaptive thresholding; reconstruct enclosed rectangular faces and check side support, then group four similarly sized aligned cells. No manually supplied region or private coordinates used to find candidates. Known private full-page blank: all four header groups recovered. On five fresh synthetic pages (10 valid and six incompatible boxed NR grids) matched 14/16 headers, including 8/10 valid and both separated-box and faint cases; two broken-header cases missed. The detector may emit extra candidates, requiring verification. Mild rotation/perspective included, not arbitrary page pose.

## R10
Discrete search over row/column offsets {-1,0,+1} and common pitch variation {-6%,0,+6%}; fit affine lattice to unique observed outlines and preserve observed centers. Header axes and gap score competing origins. Controlled single synthetic raster: 4 wrong initial origins crossed with 5 observation conditions (complete, left column omitted, right omitted, interior omitted, row omitted). Unexpanded seed 0/20 correct; expanded search 20/20, max center error criterion 5.25 pixels. Recovered 40,30,30,30,36 observed positions respectively; remaining positions inferred. These are deliberate observation removals, not physically missing bubbles; no inference of marks or authorization to accept an incomplete form. Exact 42-position recovery not measured in this particular R10 test. No formal probabilistic graph required.

## R11
Combine three page-wide proposal paths and frozen R6 verifier, suppress overlapping proposals. Initial lattice path produced two spurious review proposals on MC-only replay. Bounded correction labels lattice candidates lacking corroborating header, decimal or semantic evidence unsubstantiated, not reviewable. Fresh synthetic five-page set has variable ellipse geometry, genuine glyph fonts, 2/-3-degree rotation with mild projective transformation, broken/faint/separate boxes, unrelated MC grids, six incompatible regions. Exact42 = all 42 center errors <= one-quarter minimum pitch; counts are distinct regions.

| Path | Valid correct /10 | Valid auto-confirmed | Wrong auto-confirmed /6 | Incompatible reviews |
|---|---:|---:|---:|---:|
| Header | 8 | 6 | 0 | 4 |
| Decimal | 10 | 8 | 0 | 2 |
| Lattice | 10 | 8 | 0 | 3 |
| Header+decimal | 10 | 8 | 0 | 4 |
| All | 10 | 8 | 0 | 4 |

No distractor review on fresh set after correction. Median local Python per-page elapsed (seconds, includes generation of proposals and verifier, excludes model load): header 2.26, decimal 2.61, lattice 3.80, two-path 3.21, all 4.36. Timings potentially affected by concurrent experimental processes; not browser/iPhone measurements. Two-path ablation uses same exposed fresh cases; not a new holdout. Two-path preferred for boxed form; retain lattice fallback for forms without writing boxes and existing general detector.

Known private full-page photo: header alone 4/4 accepted; decimal 1/4; lattice zero accepted (one review and two rejects); all three 4/4 with two rejected cross-grid candidates. Two-path exactly four proposals, all accepted. Visual inspection supports alignment of 168 positions but no independent center annotations. Prior R7 found one of four. Two-path correlated transformations: original 4 accepted, half resolution 4, five-degree rotation 4, stronger projective warp 3. Same photo, not independent captures; perspective failure remains. Local secondary raster of the same form family produced 4 review proposals, no accepts. Existing synthetic practice form with unboxed, externally numbered NR grids: three review proposals through lattice path, no auto-confirmations; not exact42 annotated. Different variant, no claim of support parity.

## R12
Replay the exact five deterministic R8 pages (matching raster hashes bf6bd7a5, 11c4953d, 7641a9a1, 87216045, 8f11a4a5). Previously executed actual classroom source at a5ff1545ff9b0328c7059d03333b3c11a4335bb6 mapped 7/9 valid, proposed 4/7 incompatible for author review. Prior R8 experimental engine mapped 9/9 valid, all review, 4/7 incompatible reviewed. New all-path engine maps 9/9 valid, all review; 5/7 incompatible reviewed, 2 rejected. No wrong automatic confirmations, but review burden increased relative to prior experimental/app baseline. MC-only page zero review after correction. Actual app baseline not rerun in this cycle, no direct baseline on fresh pages or actual photograph, no independent holdout. Experimental engine only NR, app also discovers MC. No speed comparison across runtimes. 

## Disposition
Substantive progress on known real photo; recommend two-path boxed NR authoring proposal candidate for further independent evaluation, not replacement of general app detector or integration on this evidence. Main next investigations: perspective-corrected page/local header geometry and independent real/mock paper evaluation of exact 42 positions, review burden, alternative interpretations and wrong layouts. Consider inexpensive fallback lattice path for insufficient header/decimal evidence; compare actual app on same independently prepared forms. No new classifiers, external costs, physical-device validation or product code changes. Research source and observed JSON supplied separately in owner's R9–R12 archive; depends on previous R5–R8 archive. No private images, crop coordinates, or per-position private data in GitHub.
