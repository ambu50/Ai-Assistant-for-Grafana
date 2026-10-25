# Task planning for AI Assistant

Status: implemented in 1.1.3 with a sequential executor, visible validated plans, execution evidence, dashboard read-back, persistent checkpoints, and explicit continuation. Live verification results are recorded in DEPLOYMENT.md.

Optional follow-ups: streaming and parallel reads remain capability-dependent improvements. The baseline uses the existing Grafana LLM chat-completion path without imposing provider-specific parameters. A full reload interrupts a run; continuation uses persisted evidence and refreshes resources rather than replaying an in-flight request.

## Goal

Show a short, actionable plan for complex requests, execute it immediately, and update each step from actual tool results. Preserve unlimited agent rounds, the Stop button, existing conversations, and the configured Grafana LLM provider.

## Provider independence

- Use `grafana-llm-app` for provider selection, endpoints, credentials, and model configuration. Do not embed deployment hostnames, model names, or provider-specific defaults.
- Plan from task requirements and tools actually advertised by MCP. Do not assume particular datasource types, clusters, or installations.
- Treat streaming, reasoning hints, and structured-output modes as optional capabilities. Use only capability information exposed by the integration; when unknown, use the portable baseline and show unavailable options clearly. Avoid automatically replaying writes when changing request modes.
- Show neutral progress for all providers: current step, elapsed time, actual tool results, and errors. Latency does not establish whether a backend is actively generating.
- Validate with hosted and local provider response fixtures, including slow responses, absent optional fields, malformed plans, unsupported capabilities, and upstream failures. Record separately which provider configurations were tested live; local inference is one scenario, not an architectural assumption.

## Lessons from the local Graft source

- `external/vikshana-graft-app/src/services/agents/planner.ts` separates simple requests from tasks with dependencies and supplies recent conversation context to resolve references.
- `external/vikshana-graft-app/src/services/agents/orchestrator.ts` validates the structure of plans in code and separates data discovery from dashboard construction.
- `external/vikshana-graft-app/src/services/agents/specialist.ts` records executed queries instead of relying only on the model's claims about validation.
- `external/vikshana-graft-app/src/services/agents/dashboardAgent.ts` uses explicit creation, verification, and repair phases.

Adopt these design ideas through our own implementation. Start with one executor and sequential steps; this keeps execution predictable and avoids unnecessary orchestration for simple tasks across providers. Tool availability must come from discovery rather than a fixed list of four datasource categories.

## Proposed user experience

For “Add Kubernetes CPU and memory panels to dashboard abc123”:

1. Inspect the target dashboard and available datasources.
2. Discover CPU and memory metrics and validate the panel queries.
3. Update the existing dashboard while preserving unrelated panels.
4. Read the saved dashboard back and verify the requested panels.

Display this as a task checklist above the activity panel. Each item has pending, running, completed, failed, blocked, or skipped status. Show elapsed time on the active step and nest tool calls under that step. The plan starts automatically without a confirmation dialog. Allow the plan to change when evidence changes, with a brief visible explanation.

Simple requests such as listing datasources use a single visible step and do not require a separate planning request. A final answer reports completed work, unresolved items, and links to verified resources. A failed prerequisite blocks dependent writes; it does not count as task completion.

## Phase 1 — Plan state and visible checklist

- Add plan and step types with stable IDs, descriptions, dependency IDs, status, timestamps, and a short outcome. Keep tool steps distinct from task steps.
- Add typed progress events for plan creation/revision, step start/finish, tool execution, and failure. Retain the existing text activity messages during migration.
- Render the checklist and persist its final state with assistant messages. Old saved conversations remain valid when plan fields are absent.
- Display actual execution state; waiting animations do not imply backend progress or expose private model reasoning.

Acceptance: a delayed request displays its current step and timer before returning; reloading restores a completed plan; failed and blocked steps are distinguishable.

## Phase 2 — Plan creation and execution

- Expose a local `set_task_plan` function alongside the current schema-discovery function. The executor can submit or revise a structured plan in its normal first response, avoiding a compulsory extra model call.
- Use simple deterministic plans for obvious single-action requests. Instruct the model to plan complex work before sending mutation calls.
- Validate plans in code: unique IDs, existing dependencies, no cycles, supported step types, and no false completed states supplied by the model.
- If a plan is malformed, report the problem to the executor and request correction; simple advice remains available without a plan. Do not silently discard prerequisites for a complex mutation task.
- Run ready steps sequentially using the existing agent loop and on-demand tools. Associate each tool call with the current task step and scope schemas to that step where practical.
- Carry the explicit target dashboard UID, user requirements, recent conversation references, and relevant structured findings across steps.
- Continue without an application-wide round or step cap. Stop and upstream failures remain effective at each boundary. Do not run dependent steps after their prerequisite fails.

Acceptance: a dashboard task shows and executes its plan without approval pauses, preserves the target UID, runs beyond eight rounds when needed, and cannot dispatch another tool after cancellation is observed.

## Phase 3 — Evidence and dashboard verification

- Record query execution evidence with datasource UID, exact expression, time range, success/error, and whether data was returned. Distinguish valid empty results from failed or unexecuted queries.
- Pass these records to dashboard construction. Do not describe a query as validated solely because the model says so; require a matching successful execution record for the same datasource and range.
- For edits, fetch the original dashboard first and retain its version and unrelated content. Handle conflicting updates by refetching and reassessing the requested change.
- After saving, read back the dashboard and compare the actual panels, datasource references, and expressions against the task requirements. Report runtime data validation separately from structural verification.
- Repair specific mismatches and verify again. Show repeated failures as unresolved rather than marking the step complete or inventing success. Keep repair attempts visible and cancellable without adding a global iteration cap.

Acceptance: failed MCP results never produce success states; wrong datasource references are detected; empty query results are accurately reported; saving a dashboard alone does not complete its verification step.

## Phase 4 — Provider-independent reliability

- Keep the current elapsed timer and activity history, adding step-level waiting and execution timing.
- Preserve completed evidence and steps when a later request fails. Retry or resume must refetch current dashboard state before replaying writes, so a timeout does not cause duplicate changes.
- Keep provider request timeouts, context limits, and output truncation visible as distinct failures. Unlimited task rounds cannot remove those upstream constraints.
- Consider streaming only after confirming the Grafana LLM path supports complete tool-call assembly, error handling, and cancellation. Render public output and concise action summaries as available.
- Consider parallel independent reads after measuring correctness and latency across supported provider paths. Respect dependencies and keep mutations sequential.

## Validation and rollout

Automated coverage should exercise dependency validation, malformed plans, transitions based on actual results, planning without approval, follow-up target references, execution beyond eight rounds, Stop, persistence compatibility, and dashboard read-back mismatches.

Use the configured Grafana LLM provider for a read-only multi-step investigation first. Then use a clearly named test dashboard to verify creation, targeted editing, preservation of unrelated panels, read-back, failure display, and cancellation. Inspect the resulting dashboard, not just the assistant's final response. Deploy with the visible version badge and record exactly which live scenarios passed.

Recommended first delivery: phases 1 and 2 together. Follow with evidence and dashboard verification, then resume and streaming improvements. This gives users useful task visibility before introducing a larger orchestration system.
