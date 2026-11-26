# MC-R25 — PSA engineering handoff

Status: research candidate transferred and verified; not production-integrated, independently accepted, or authorized for deployment by this handoff. Use selective integration rather than merging the research branch wholesale.

## Repository inventory and provenance

The versioned folders preserve the exact extracted archive bytes, not reformatted or regenerated files.

| Directory | Files | Original archive SHA-256 |
| --- | ---: | --- |
| r1-r8/ | 13 | 2bc9cdbef39fa35c3e9e3cf70de4bf531577ea447b38c6d014bc59fe2ba544a2 |
| r9-r16/ | 21 | 88630083b384f79ef891d05cb1541d4eaa24299863a9c24f5c01adc5ecc13252 |
| r17-r24/ | 35 | ab718341643a2778d292a2ceeb901ddc6db9218f93fe41c845e54e0f5e199dc4 |

The R9–R16 and R17–R24 internal SHA-256 manifests were verified (20 and 34 entries respectively). R1–R8 has no internal manifest; 12 of its 13 files match the earlier research branch's root files. The only difference is README.md; both versions are retained. All 69 newly transferred files were independently compared to Git blob hashes calculated from the corresponding archive bytes; all match. The frozen binary bank is 699840 bytes, Git blob 8ca62589b6bc593ea7080d6a8873a4f08b6192c0, SHA-256 7d41987761e78fd7f5ac597d2b80537630b4afe7ff9d3ed8dcc02ba82c83cf8b. No private assessment image, answer key, student data or font file is included; private photo observations in the reports are aggregate only.

## Candidate entry points

- Current experimental Python reference and instructions: r17-r24/README.md, combined.py, joint.py, header_path.py, glyphs.py, mc_core.py.
- Native raster entry: r17-r24/native/raster.mjs, exports loadBank(meta, bytes) and discoverNative(grayscaleUint8Array, width, height, bank, nrProposals=[]). Input coordinates are rectified raster pixels, not page points. Convert exactly once through the shared page mapping. Input is a blank sheet; this is not completed-sheet recognition.
- Native structural inference: native/structure.mjs exports discoverFeatures(pts, glyphs, nr=[]), finalize(rows, nr=[]).
- Worker entry: native/worker-client.mjs exports MCWorker with init(meta, bytesArrayBuffer), discover(pixelsArrayBuffer, width, height, nr=[], timeout=20000), close(reason). Both buffers are transferred/detached; preserve originals in caller as needed. Host loads same-origin cached assets and supplies them. Worker verifies frozen binary and label order. Terminate on every success/failure/cancel. Native worker and Node adapter are distinct; Node-only files are development harnesses, not app assets.
- Frozen asset pair: native/glyph-bank.f32 and glyph-bank.json. Use exact bytes. HOG templates are default; no new SVM training and no new SVM model required. The existing NR SVM remains unchanged. Native helpers copied from NR are candidates for reuse of the existing app modules after checking behavior, not a requirement to duplicate them.
- MC output rows include points, observed mask, decision, optional number, review_reasons, geometry_observed, number_provenance and optional arbitration. A recognized number is an OCR suggestion, not an authoritative ID. Internally confirmed does not mean teacher-confirmed or safe to auto-save. Missing positions/row count uncertainty and conflicts must remain visible. Preserve observed geometry through correction. The prototype does not supply product-ready page-point profiles or all required bubble-radius metadata; LSDE must validate the coordinate/radius mapping using real outline evidence, established geometry, or a clearly reviewed estimate.
- Joint arbitration receives external NR proposals with centers and structural evidence in the same raster coordinate system. An NR-like rejected proposal may challenge an MC interpretation without granting NR mapping validity. nr-preferred is a recommendation, not permission for silent deletion. Verify native joint MC/NR execution, evidence contracts, conversions and exclusion/kept-block behavior. Retain fallback when either engine fails.

## Reproduction and handoff smoke check

Use a scratch copy of r17-r24 for regeneration because make_native_fixtures.py writes generated files under /tmp/mc_native_fixtures and overwrites the local feature bank; retain and verify the original committed bank before runtime checks. See README.md for exact commands and dependencies. Font availability affects generated glyphs. Use the previously committed NR portable reference or trusted prior NR archive for optional Python SVM/NR experiments; no pickle from untrusted sources. The original pinned deployed MC baseline harness remains at research/psa-mc/baseline.mjs (its relative app import assumes that location; the archived r1-r8 copy is preserved verbatim).

R25 reran the three native harnesses with Node v22.16.0 from a fresh extraction of the R17–R24 archive, using the existing 24 locally generated synthetic fixtures (not newly regenerated or independently authored). Results: 344/344 proposals, exact coordinates (maximum difference zero), numbers, observed masks and decisions at shared-feature level. Raster: 336/336 mapped, 262 true confirmations, 12 extra provisional proposals, zero false confirmations, zero wrong recognized numbers on matched rows. Worker: normal, malformed, corruptBank, corruptLabels, cancel and timeout pass. These repeat the recorded development results, not independent acceptance.

## LSDE integration recommendations and gates

Keep Established and bounded recovery available. Consider unified PSA Structured whole-page discovery using existing rectification, MC and NR proposal generation, explicit arbitration and a single shared template editor. Preserve existing completed-sheet registration, mark reading, grading, persistence and backup; avoid changing profile schema unless needed and verified. Maintain individual row insert/delete with correct neighboring geometry, optional expected count, observed/inferred/manual provenance, and exact local diagnostic export if not already present.

Required independent gates before deployment authorization is exercised: held-out comparison against current Established and candidate, MC/NR overlap controls including malformed NR, intentional gaps, 4/5 choices, absent numbers and headers, partial/missing rows; exact localization and numbering oracles; no silently confirmed unsupported mappings; review/correction and saved-profile interoperability; regression of completed-sheet recognition, grading and wrong-layout safeguards; actual browser/worker and offline cache behavior, asset integrity/fallback, cancellation/timeouts and resource limits. Python vs native raster parity is incomplete (8 vs 12 extra provisional proposals); investigate concrete safety or usability implications, not cosmetic exact parity. Existing synthetic tests were developed/tuned by PSA. Physical iPhone timing, memory and camera validation remain an outstanding acceptance item, not by themselves a prerequisite for independently verified software deployment when separately authorized by Product Owner. No production changes in R25.

Avoid premature optimization or further broad algorithm R&D. Engage PSA for focused correction if independent evidence warrants it.
