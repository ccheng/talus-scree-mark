# Talus Scree Mark

Talus Scree Mark is a planned iPhone-first web app for photographing, reading and grading paper answer sheets. It will support multiple-choice bubbles, four-position numerical-response bubbles, optional local handwriting recognition and teacher review. Capture, recognition, grading and storage will run on the device, with explicit local export.

This repository currently contains the Milestone 0 foundation proposal and a synthetic fixture test harness. Production recognition, camera capture and offline installation are future milestones.

## Run the foundation checks

Use Node.js 24 LTS. From a fresh checkout, run `npm test`. The test runner uses Node built-ins and needs no dependency installation, credentials, browser or network. The results cover repository and fixture contracts.

## Project documents

- [Foundation report](docs/MILESTONE_0_FOUNDATION_REPORT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Recognition research and benchmark](docs/RECOGNITION_RESEARCH.md)
- [Roadmap](ROADMAP.md)
- [Quality gate](QUALITY_GATE.md)
- [Handoff](HANDOFF.md)
- [Contributor instructions](AGENTS.md)

Use only synthetic or explicitly approved anonymized fixtures. Keep student papers, answers and recognition results on the device and out of the repository, issues and pull requests.
