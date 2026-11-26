# MC-R9–R16 research findings

Development-only Python experiments; no production integration or independent acceptance. The complete tested source and JSON results are in the accompanying Product Owner archive Talus_PSA_MC_R9_R16_Research.zip (SHA-256 88630083b384f79ef891d05cb1541d4eaa24299863a9c24f5c01adc5ecc13252). This commit records findings, not a copy of that source archive.

- R9–R12: independent number-chain and header-led hypotheses. On 12 synthetic pages, first-cycle reference mapped 167/168 true rows and confirmed two false rows. Combined reference mapped 168/168 (161 confirmed, seven provisional), with four false proposals all requiring review. A separate sheet with one missing bubble per row and no numbers recovered 14/14 provisional rows via headers versus zero from the first cycle. OCR-only whole-row recovery requires consecutive supported neighbors on both sides, avoiding unsupported endpoint extrapolation.
- R13: two mixed synthetic pages, 44/44 genuine MC rows recovered. Eleven false MC proposals overlapped NR structures; all became review-only after reconciliation with actual prior NR reference results. Strongly corroborated malformed NR structure may challenge MC without being accepted as valid NR. No automatic deletion.
- R14: known inverse perspective homography improved 39/56 to 56/56; not automatic corner detection. Optional local affine refinement improved 164/168 to 168/168 on 12 sheared pages. Disabled by default pending further testing.
- R15: existing NR SVM 432/480 vs HOG template matching 416/480 segmented noisy synthetic digits. By rendering size 9,13,20,30: SVM 86,111,117,118 vs templates 70,109,117,120 each /120. No end-to-end OCR claim; combined MC path still uses templates.
- R16: comparative development evidence only; same fixtures used to tune. Need independent evaluation, deployed JS baseline comparison, broader malformed-form and overlap tests, then native port decision. No deployment or production changes.

Tested core source SHA-256:
joint.py da5bd0f2036c425be764023cc4caaba855d0e1fdc2194fdd48b4c540454bb45d
header_path.py a8caab7c68716a66f8b151da488ebc483f0a282afb5c4ffbb7e2d769135a4216
combined.py 76c39631794912c70226403a5c405a32111a066ede329e0de8df11e2aae3fc02

No private photo, image coordinates, or student data in this commit.
