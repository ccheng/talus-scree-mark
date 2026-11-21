# Project handoff

Milestone 0 is accepted and merged in [PR #1](https://github.com/ccheng/talus-scree-mark/pull/1). Milestone 1 is accepted after Product Owner iPhone validation and merged in [PR #3](https://github.com/ccheng/talus-scree-mark/pull/3) at `83f5088f5a25b55ec8704d18b199df68bfd9956d`. [PR #2](https://github.com/ccheng/talus-scree-mark/pull/2) was superseded because its specification was included in PR #3.

M2 is accepted as a functional recognition milestone after seven Product Owner iPhone passes. [PR #5](https://github.com/ccheng/talus-scree-mark/pull/5) was merged and PR #4 was superseded. The live [synthetic preview](https://ccheng.github.io/talus-scree-mark/) serves build `c7c778c9`. See the [acceptance record](docs/MILESTONE_2_ACCEPTANCE.md) and [independent synthetic evaluation](docs/MILESTONE_2_EVALUATION_REPORT.md). The representative physical benchmark and formal iPhone latency target are deferred until more representative M3 layouts are available.

The [M3 specification](docs/MILESTONE_3_SPECIFICATION.md) is proposed for review. Implementation awaits Product Owner approval. Preserve the M1/M2 automated suites and M2 reference compatibility. After approval, the Developer implements, the Independent Tester verifies the exact build and the Research Evaluator controls the holdout. Use one bounded correction with focused retest and reassessment, then stop for the Product Owner’s acceptance and merge decision.

See the [architecture](docs/ARCHITECTURE.md), [roadmap](ROADMAP.md), [research proposal](docs/RECOGNITION_RESEARCH.md), and [quality gate](QUALITY_GATE.md). Before M4, resolve NR grading rules. Evaluate a dedicated isolated HTTPS origin before any actual student-data pilot. Repository licensing remains a Product Owner decision.
