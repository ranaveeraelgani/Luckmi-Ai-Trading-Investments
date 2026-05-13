# Smart Money Build System

This folder is the execution system for delivering the Smart Money Dashboard end-to-end.

Purpose:
- Keep build work scoped to clear phases
- Provide implementation checklists per phase
- Track status and blockers in one place
- Ensure every phase is testable and deployable

## Phase Index

1. Phase 1 - MVP Dashboard
   - File: docs/smart-money/phases/phase-1-mvp.md
   - Goal: Ship production-ready dashboard, scoring, and action flows

2. Phase 2 - Product Integration and Reporting
   - File: docs/smart-money/phases/phase-2-integrations.md
   - Goal: Integrate SMS into existing surfaces and enable adoption analytics

3. Phase 3 - Monetization and Controls
   - File: docs/smart-money/phases/phase-3-monetization.md
   - Goal: Add subscription gates, experimentation, and safer rollout controls

4. Phase 4 - Advanced Signals and Validation
   - File: docs/smart-money/phases/phase-4-advanced.md
   - Goal: Expand signals and prove performance with backtesting/reporting

## Build Tracker

- File: docs/smart-money/build-tracker.md
- Use this file daily during implementation.
- Update status, owner, and completion date per work item.

## How To Use During Build

1. Start with Phase 1 and do not begin a new phase until Phase 1 exit criteria pass.
2. At the start of each day:
   - Review open items in docs/smart-money/build-tracker.md
   - Pick work only from the current active phase
3. At the end of each merged PR:
   - Mark completed tasks in the phase file
   - Add test evidence links in the tracker
4. Before moving phases:
   - Validate all required tests
   - Validate deployment and monitoring checkpoints

## Source Specs

The phase files are derived from:
- SMART_MONEY_SPEC.md
- UI_MOCKUP_GUIDE.md
- SMART_MONEY_IMPACT_ANALYSIS.md
- SMART_MONEY_QUICKSTART.md
