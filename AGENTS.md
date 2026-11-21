# Talus Scree Mark contributor instructions

The Product Owner approves each milestone, its acceptance, and any merge or public deployment. The SWE Director Assistant owns strategic architecture and milestone direction. The Coordinator integrates the work and reports the outcome.

For each approved milestone:

1. Create a branch from the verified base and keep the PR scoped to the approved specification.
2. Delegate implementation, documentation and unit/integration tests to the Developer.
3. Give the Independent Tester the acceptance specification and exact candidate commit. Have the Research Evaluator run controlled recognition evaluations when relevant.
4. If defects are verified, allow one bounded Developer correction cycle with regression coverage, then focused independent retesting and any affected benchmark reassessment.
5. Stop and report evidence, unresolved defects and disposition to the Product Owner. Keep the PR unmerged pending explicit authorization.

Use [QUALITY_GATE.md](QUALITY_GATE.md) to record evidence and [ROADMAP.md](ROADMAP.md) to identify scope. Run `npm test` locally. Record commands and results actually observed, including simulation, desktop browser and real-device distinctions.

Keep production processing client-side and offline capable. Keep bubble recognition independent of the handwriting model. Store raw evidence and corrections as separate records. Use synthetic or explicitly approved anonymized fixtures only. Never put identifiable student data, real student work, answers or recognition records into GitHub or an external service. Keep held-out benchmarks outside the public repository. Obtain Product Owner authorization before adding paid services, expanding scope, or enabling deployment.
