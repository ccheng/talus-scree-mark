# Talus Scree Mark

Talus Scree Mark is a planned iPhone-first web app for photographing, reading and grading paper answer sheets. It will support multiple-choice bubbles, four-position numerical-response bubbles, optional local handwriting recognition and teacher review. Capture, recognition, grading and storage will run on the device, with explicit local export.

The accepted Milestone 0 foundation provides the project documentation and a synthetic fixture test harness. Milestone 1 is accepted and merged. Its offline shell supports temporary camera capture and JPEG/PNG preview. Milestone 2 is accepted for functional reference-sheet alignment and bubble recognition. The representative physical benchmark moves to M3.

## Run locally

Use Node.js 24 LTS. Run `npm test` for the foundation and capture unit tests, `npm run check:release` to verify the shell asset digests, and `npm start` to open [the local app](http://127.0.0.1:4173/talus-scree-mark/). Run `npm run build` after editing the shell. To regenerate the checked-in reference assets, install Poppler's `pdftoppm` and run `npm run build:reference`, then rebuild the shell. The app and its unit tests use no third-party npm packages.

For physical iPhone testing, use the [GitHub Pages development preview](https://ccheng.github.io/talus-scree-mark/) once published and follow the [iPhone acceptance checklist](docs/MILESTONE_1_IPHONE_CHECKLIST.md). Use mock data only.

## Project documents

- [Foundation report](docs/MILESTONE_0_FOUNDATION_REPORT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Recognition research and benchmark](docs/RECOGNITION_RESEARCH.md)
- [Roadmap](ROADMAP.md)
- [Milestone 1 specification](docs/MILESTONE_1_SPECIFICATION.md)
- [Milestone 2 functional acceptance](docs/MILESTONE_2_ACCEPTANCE.md)
- [Milestone 3 specification](docs/MILESTONE_3_SPECIFICATION.md)
- [M3 printable forms and iPhone walkthrough](docs/MILESTONE_3_PHYSICAL_EVALUATION.md)
- [M3 local PDF import investigation](docs/MILESTONE_3_PDF_INVESTIGATION.md)
- [Milestone 2 specification](docs/MILESTONE_2_SPECIFICATION.md)
- [Milestone 2 printable materials and iPhone walkthrough](docs/MILESTONE_2_PHYSICAL_EVALUATION.md)
- [Milestone 2 independent synthetic evaluation](docs/MILESTONE_2_EVALUATION_REPORT.md)
- [iPhone acceptance checklist](docs/MILESTONE_1_IPHONE_CHECKLIST.md)
- [Quality gate](QUALITY_GATE.md)
- [Handoff](HANDOFF.md)
- [Contributor instructions](AGENTS.md)

Use only synthetic or explicitly approved anonymized fixtures. Keep student papers, answers and recognition results on the device and out of the repository, issues and pull requests.
