# Project handoff

Milestone 0 is accepted and merged in [PR #1](https://github.com/ccheng/talus-scree-mark/pull/1). Milestone 1 is accepted after Product Owner iPhone validation and merged in [PR #3](https://github.com/ccheng/talus-scree-mark/pull/3) at `83f5088f5a25b55ec8704d18b199df68bfd9956d`. [PR #2](https://github.com/ccheng/talus-scree-mark/pull/2) was superseded because its specification was included in PR #3.

The live [synthetic-only preview](https://ccheng.github.io/talus-scree-mark/) serves build `14ff4669`. The Coordinator verified all 12 published app files against merged main, and the exact PR candidate passed [independent desktop acceptance](https://github.com/ccheng/talus-scree-mark/actions/runs/44857057678). Product Owner acceptance establishes the iPhone validation. The device model, iOS build and a controlled physical two-release update result were not separately supplied in the acceptance record.

[M2 alignment and bubble recognition](docs/MILESTONE_2_SPECIFICATION.md) is approved for implementation. The Developer implements, the Independent Tester owns acceptance, and the Research Evaluator runs the sealed holdout. If defects surface, apply one bounded Developer correction, focused independent retest and affected benchmark reassessment. Report evidence and stop for Product Owner acceptance and merge approval.

See the [architecture](docs/ARCHITECTURE.md), [roadmap](ROADMAP.md), [research proposal](docs/RECOGNITION_RESEARCH.md), and [quality gate](QUALITY_GATE.md). Before M3, resolve how to register existing sheets without anchors. Before M4, resolve NR grading rules. Evaluate a dedicated isolated HTTPS origin before any actual student-data pilot. Repository licensing remains a Product Owner decision.
