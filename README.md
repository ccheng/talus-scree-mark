# Talus Scree Mark

Talus Scree Mark is a planned iPhone-first web app for photographing, reading and grading paper answer sheets. It will support multiple-choice bubbles, four-position numerical-response bubbles, optional local handwriting recognition and teacher review. Capture, recognition, grading and storage will run on the device, with explicit local export.

The accepted Milestone 0 foundation provides the project documentation and a synthetic fixture test harness. Milestone 1 is accepted and merged. Its offline shell supports temporary camera capture and JPEG/PNG preview. Milestone 2 proposes reference-sheet alignment and bubble recognition for review before implementation.

## Run locally

Use Node.js 24 LTS. Run `npm test` for the foundation and capture unit tests, `npm run check:release` to verify the shell asset digests, and `npm start` to open [the local app](http://127.0.0.1:4173/talus-scree-mark/). Run `npm run build` after editing the shell. The app and its unit tests use no third-party packages.

For physical iPhone testing, use the [GitHub Pages development preview](https://ccheng.github.io/talus-scree-mark/) once published and follow the [iPhone acceptance checklist](docs/MILESTONE_1_IPHONE_CHECKLIST.md). Use mock data only.

## Project documents

- [Foundation report](docs/MILESTONE_0_FOUNDATION_REPORT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Recognition research and benchmark](docs/RECOGNITION_RESEARCH.md)
- [Roadmap](ROADMAP.md)
- [Milestone 1 specification](docs/MILESTONE_1_SPECIFICATION.md)
- [Milestone 2 specification (proposed)](docs/MILESTONE_2_SPECIFICATION.md)
- [iPhone acceptance checklist](docs/MILESTONE_1_IPHONE_CHECKLIST.md)
- [Quality gate](QUALITY_GATE.md)
- [Handoff](HANDOFF.md)
- [Contributor instructions](AGENTS.md)

Use only synthetic or explicitly approved anonymized fixtures. Keep student papers, answers and recognition results on the device and out of the repository, issues and pull requests.
