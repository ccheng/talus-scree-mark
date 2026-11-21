# Milestone 2 acceptance

The Product Owner accepted M2 as a functional recognition milestone after seven physical iPhone passes. [PR #5](https://github.com/ccheng/talus-scree-mark/pull/5) merged to main at `7a72f910fba179157ea48c6657c0eb752767dbb5`. PR #4 is superseded.

| Product Owner iPhone check | Result |
| --- | --- |
| Supplied completed PNG import and recognition | Pass |
| Camera recognition of printed completed PDF | Pass |
| Recognition of manually pencilled answers | Pass |
| Rotated and tilted camera capture | Pass |
| Double-mark and erased-mark handling | Pass |
| Registration marker outside frame rejected | Pass |
| Offline cold reopening and recognition in airplane mode | Pass |

These are functional outcomes reported by the Product Owner. Device model, OS version, exact client mode per case, and individual timings were not supplied. The larger representative physical benchmark is deferred until M3 supports more representative layouts. Statistical reliability, clustered physical uncertainty and the formal iPhone latency target remain unverified.

The [independent synthetic report](MILESTONE_2_EVALUATION_REPORT.md) and [exact-candidate Chromium run](https://github.com/ccheng/talus-scree-mark/actions/runs/44880535455) record separate evidence. Preserve existing recognition tests as permanent regression coverage. The [synthetic preview](https://ccheng.github.io/talus-scree-mark/) serves M2 build `c7c778c9`.
