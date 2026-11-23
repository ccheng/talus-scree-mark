# Talus Scree Mark contributor instructions

The Product Owner approves each milestone, its acceptance, and any merge or production deployment. The Product Owner has authorized a public GitHub Pages preview for synthetic development testing of user-facing milestones. The SWE Director Assistant owns strategic architecture and milestone direction. The Coordinator integrates the work and reports the outcome.

For each approved milestone:

1. Create a branch from the verified base and keep the PR scoped to the approved specification.
2. Delegate implementation, documentation and unit/integration tests to the Developer.
3. Give the Independent Tester the acceptance specification and exact candidate commit. Have the Research Evaluator run controlled recognition evaluations when relevant.
4. If defects are verified, allow one bounded Developer correction cycle with regression coverage, then focused independent retesting and any affected benchmark reassessment.
5. Stop and report evidence, unresolved defects and disposition to the Product Owner. Keep the PR unmerged pending explicit authorization.

Use [QUALITY_GATE.md](QUALITY_GATE.md) to record evidence and [ROADMAP.md](ROADMAP.md) to identify scope. Run `npm test` locally. Record commands and results actually observed, including simulation, desktop browser and real-device distinctions.

Keep production processing client-side and offline capable. Keep bubble recognition independent of the handwriting model. Store raw evidence and corrections as separate records. Use synthetic or explicitly approved anonymized fixtures only. Never put identifiable student data, real student work, answers or recognition records into GitHub or an external service. Keep held-out benchmarks outside the public repository. Obtain Product Owner authorization before adding paid services, expanding scope, or enabling production deployment. Keep published preview assets synthetic and evaluate a dedicated, isolated HTTPS origin before actual student-data use.

The [Development Mini-Charter v3](docs/TEAM_MINI_CHARTER_V3.md) is authoritative from M4 onward. The Developer-Architect owns architecture, implementation, integration and delivery coordination. The Independent Tester verifies substantive changes separately. Engage the Research Evaluator when warranted. The Product Owner approves scope, acceptance, merges and release deployment.

A development candidate is available for synthetic inspection after basic integrity and privacy checks, with its exact build and known failures disclosed. An acceptance candidate has passed mandatory gates and awaits Product Owner testing or approval. An accepted release requires explicit Product Owner approval to merge and deploy. Keep development previews separate from the stable channel where practical. M3 assumes one sheet per capture. Multiple-sheet detection is best effort, and further work is deferred.
