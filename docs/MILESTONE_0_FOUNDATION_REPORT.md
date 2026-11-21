# Milestone 0 Foundation Report

## Repository and deliverables

The public `ccheng/talus-scree-mark` repository started on `main` at `4c840c6171cb97aff178621ece4138248ea2382e`, with only a README, zero open pull requests, GitHub Pages disabled and no detected license. Milestone 0 adds decisions for review, contributor conventions and a dependency-free synthetic fixture harness. Production implementation and deployment require later approval.

- [Architecture and module interfaces](ARCHITECTURE.md)
- [Recognition research and benchmark](RECOGNITION_RESEARCH.md)
- [Prioritized milestone roadmap](../ROADMAP.md)
- [Quality gate and device matrix](../QUALITY_GATE.md)
- [Coordinator handoff](../HANDOFF.md)
- [Milestone branch](https://github.com/ccheng/talus-scree-mark/tree/milestone-0/foundation)
- [Pull request and acceptance evidence](https://github.com/ccheng/talus-scree-mark/pull/1)

## Team and execution

The Developer inspected the baseline, proposed the module boundaries and offline shell, and implemented the fixture harness. The Independent Tester designed the acceptance tiers, evidence and regression conventions, and the iPhone checklist. The Research Evaluator reviewed OMR and CNN options and proposed metrics, holdout controls and thresholds. The Coordinator integrated the work. The [contributor instructions](../AGENTS.md) define independent review, one bounded correction cycle and Product Owner acceptance.

Start with an offline capture shell, then fixed-layout bubble OMR, reusable profiles, grading and exports, optional handwriting and comparison, and a mock-sheet pilot. The OMR baseline will use geometric registration and locally normalized bubble scoring. The handwriting benchmark will start with local WASM and a small pretrained CNN. Each milestone has measurable proposed criteria in the roadmap. Device checks and empirical accuracy measurements are future work.

## Open decisions

| Decision | Recommendation and timing |
| --- | --- |
| Reference device and test origin | Pick the oldest iPhone/iOS combination the Product Owner wants supported. Use an authorized secure origin for camera and offline tests in M1. |
| New and existing sheet layouts | Default to reusable teacher-selected profiles with printed orientation anchors and IDs. Decide whether unmarked historical forms are needed before M2. Evaluate manual registration before committing to automated discovery. |
| NR grading policy | Define allowable characters and printed signs per layout, and specify leading zeros, decimals, alternate correct answers and tolerance before M4. |
| Data lifetime and hosting | Decide retention of source photos versus review crops, deletion and local backup policy before a pilot. Use a dedicated HTTPS origin to isolate browser storage from other Pages apps. |
| Licensing and model footprint | Have the Product Owner choose the repository license. Keep the foundation dependency-free, benchmark the full CNN bundle and retain required notices before distribution. |

The requested disposition is Product Owner review of the Milestone 0 PR. Acceptance and merge are separate from authorization to begin M1.
