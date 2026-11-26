# MC-R17–R24 research candidate

Complete tested candidate source, harnesses and results are in the Product Owner archive Talus_PSA_MC_R17_R24_Research.zip, 35 files, archive SHA-256 ab718341643a2778d292a2ceeb901ddc6db9218f93fe41c845e54e0f5e199dc4. This commit records findings and provenance; it does not contain the full archive or a production implementation.

- R17: consolidate shared feature extraction; fix multi-digit grouping using bounding-box adjacency and overlap.
- R18: 12 new synthetic development pages, 168 genuine rows. Template path before correction 162 mapped, 128 correct recognized numbers, 10 wrong numbers; after correction 168, 148, 0. SVM candidate digit path 167, 145, 0; hybrid 168, 148, 0. Retain template default.
- R19: two mixed pages using the earlier actual NR Python reference; 44 genuine MC rows recovered, 9 false MC proposals flagged, 1 NR-preferred recommendation, none deleted. Entire unnumbered families require count review.
- R20: first-cycle 154/168, consolidated 168/168, number-path ablation 159/168, independent header-recovery ablation 167/168. Fresh but self-authored development tests used for correction. Independent three-way comparison with exact deployed baseline remains outstanding.
- R21–R23: candidate Python reference and native JS port. Identical-feature tests across 24 pages match all 344 proposals, center coordinates, numbers, decisions, and observed masks. Raster evaluation maps 336/336 true rows in both, 262 true confirmations each, zero false confirmations, 8 Python vs 12 native extra provisional proposals. Raster equivalence incomplete. Known private blank-photo diagnostic: both 14 proposals, labels 1–14, two headers, zero review. No independently measured real-photo localization. Native uses externally supplied NR proposals; combined native arbitration verification pending. Native Node runs 0.287–0.683s on synthetic pages, excludes NR, rectification and bank generation; not iPhone performance.
- R24: Node worker normal, malformed input, corrupt bank, corrupt labels, cancellation, timeout pass. Browser navigation blocked by administrator. Browser/offline/PWA/mobile execution, memory, automatic rectification, independent acceptance remain outstanding. No deployment or production changes.

Tested source SHA-256:
combined.py a8ac7d3a5619e5f06b964509bcac42128dec6d5568dbd429a4a5d140bab92fce
joint.py 1acf25b7131a8ca4963a39fb2546bf02b7990780fd5bf816836b32241cabac95
native/structure.mjs c6aca8f0374dbc2bd665628c3792dd234abf93a360a1d1b6a4e28d6086db70bd
native/raster.mjs 8945c81df407b6eb7ea5f9bdf15545ca8d78933f685154d868ddb3b5d165040c
native/worker.mjs 45d44e53ff007d9af90db62aa363df13b981e2fb5b76b7aef9d5a5afc746403b
native/glyph-bank.f32 7d41987761e78fd7f5ac597d2b80537630b4afe7ff9d3ed8dcc02ba82c83cf8b

No private images, coordinates, keys or student data included. Next gate is independent held-out evaluation, native raster and joint MC/NR verification, browser and mobile acceptance. Avoid premature optimization or further model training.
