# CPAS classroom preview

The preview compares two experimental recognition paths using the same registered sheet. Established reads and grades first. The CPAS worker starts after the authoritative result, and can fail, time out or be canceled independently. Each worker is terminated when its result arrives or it is canceled. The optical worker and handwriting model use local assets. Direct research exports include the optical state probabilities, ink and reference contributions, and the complete handwriting distribution over digits, dot, blank and other.

The scan panel highlights differences and review reasons. Expand an item to see the Established read, CPAS optical read, position evidence, confidence and any handwriting disagreement. The preview draws no conclusions about student intent. Handwriting cannot select a bubble or resolve incomplete optical evidence.

The preview stores the teacher-selected unmarked JPEG or PNG in an independent local IndexedDB store, keyed to the profile revision and geometry. Only the selected blank is decoded at a time. Replace or remove it in the setup panel. Saved blanks stay local to the browser and are outside profile and grade exports. The worker checks reference registration each scan and labels reference-free results when the saved blank fails its check. The teacher still confirms that the reference is unmarked and belongs to the selected form. Storage failure allows a session-only reference. Current profiles and Established grading records use the same schema as the standard app.

The PSA reviewed the reference and handwriting design. A later enrollment interface can use the already registered blank in the template editor, save compact reference patches, and let teachers confirm handwriting boxes discovered from the blank. The current handwriting map stays explicit. No change to the profile schema or registration geometry is required for this preview.

See [the physical iPhone procedure](CPAS_IPHONE_ACCEPTANCE.md). Desktop software checks and physical iPhone acceptance are separate.
