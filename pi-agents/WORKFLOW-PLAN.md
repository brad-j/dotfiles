# Pi workflow improvement plan

## Objective

Make Pi better at bounded execution, task closure, and recurring review without turning Pi itself into an always-on scheduler.

## Decisions

- Use macOS `launchd` for wall-clock jobs that must run when Pi is closed.
- Use a Pi scheduling extension only for bounded, in-session waits such as deployment or CI polling.
- Use prompt templates for repeatable manual workflows.
- Use lifecycle extensions for context, scope, and handoff reminders.
- Keep scheduled reviews read-only and isolate their sessions from interactive work.
- Keep runtime settings, sessions, credentials, and generated state outside this repository.

## Rollout

- [x] **1. Add workflow prompt templates**
  - Add `prompts` to `platform/package.json`.
  - Add `/start`, `/task`, `/checkpoint`, and `/close`.
- [x] **2. Use an appropriate default thinking level**
  - The code agent defaults to `high` instead of `xhigh`.
  - The print and Proxmox agents remain at `medium`.
  - Use `xhigh` explicitly for architecture, difficult debugging, and other reasoning-heavy work.
- [ ] **3. Make compaction a checkpoint**
  - Keep overflow recovery automatic.
  - Stop injecting an automatic continuation after threshold or manual compaction.
  - Notify the user to choose `/close`, `/handoff`, or deliberate continuation.
- [ ] **4. Improve handoff reminders**
  - Remind once after ten human prompts or roughly 60–65% context usage.
  - Avoid repeated reminders within the same compaction cycle.
- [ ] **5. Add a weekly AI review with `launchd`**
  - Add a reusable weekly-review prompt.
  - Run a one-shot, read-only Pi process.
  - Review only the previous seven days.
  - Store reports privately and use a dedicated automation session directory.
- [ ] **6. Evaluate an in-session scheduler only when needed**
  - Initial use case: bounded deployment or CI polling.
  - Prefer prompt/notification actions.
  - Do not enable arbitrary scheduled shell execution without a strict allowlist.

## Prompt template responsibilities

### `/start`

Turn a new project idea into a bounded first milestone, constraints, non-goals, completion criteria, and validation plan. Ask only material questions and wait for agreement before creating or implementing the project.

### `/task`

Inspect an existing project, establish a compact task brief, and proceed when the objective is clear. Preserve unrelated work and keep the session focused on one outcome.

### `/checkpoint`

Summarize completed work, validation, current blockers, and the next coherent milestone without making implementation changes. Recommend `/handoff`, a separate `/task`, or `/close` when appropriate.

### `/close`

Re-read the objective, inspect changes, run relevant checks, verify user-facing behavior, clean temporary work, record unresolved risks, and stop before beginning another milestone.

### Weekly review

Review recent sessions and active projects for:

- shipped work
- stalled or unclosed work
- scope drift
- repeated corrections
- active-project overload
- the next shippable milestone for each retained project
- no more than three recommended active personal projects

The review must recommend work, not modify projects.

## Scheduled review architecture

A LaunchAgent should invoke a wrapper script that:

1. Changes to a stable working directory.
2. Disables startup version checks for the run.
3. Starts Pi in print mode with a lower-cost model and moderate thinking.
4. Uses a strict read-only tool allowlist such as `read,grep,find,ls`.
5. Uses `--no-approve` so project-local executable resources are ignored.
6. Stores sessions in a dedicated automation session directory.
7. Writes standard output to a private dated Markdown report.

`launchd` owns timing and process startup. Pi owns analysis. The wrapper owns report creation.

## Configuration guidance

- Keep project trust at `ask`; use `--no-approve` for unattended jobs.
- Keep message delivery one at a time.
- Keep auto-compaction enabled.
- Restrict tools per automation invocation rather than weakening interactive defaults.
- Use explicit model and thinking flags for scheduled jobs instead of inheriting interactive defaults.

## Scheduler extension boundary

In-process Pi schedulers are appropriate for tasks such as:

- check a deployment again in ten minutes
- poll CI every five minutes with a maximum run count
- notify the current session after a bounded delay

They are not the primary scheduler for weekly reviews because their timers only run while Pi is open. Any scheduler package must be reviewed before installation because Pi extensions execute with the user's full system permissions.
