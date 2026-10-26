# Authorization boundary

AI Assistant 1.0.0 uses `grafana-llm-app` for model completions only. It does not connect to the LLM plugin's MCP server. On local installations that server can execute with a shared service account rather than the requesting user's permissions. Earlier development builds using shared MCP execution must not be published as safe for multi-user use with that route enabled.

## Required deployment containment

Disable the shared MCP server in the existing LLM settings with `jsonData.mcp.disabled: true` (and `enabled: false` for frontend compatibility), preserving provider configuration and secure settings. Restart Grafana to terminate old plugin instances and MCP connections. Verify that a non-admin HTTP POST to `/api/plugins/grafana-llm-app/resources/mcp/grafana` cannot initialize a connection. This also disables MCP tooling for other applications relying on that shared endpoint; model completions remain available. Do not blindly replace the LLM settings JSON with only the MCP fields.

## Execution

- Every supported tool uses Grafana's normal API with the browser session. There are no embedded tokens, custom authorization headers, arbitrary URLs, identity arguments, or service-account fallback.
- All actual dashboard saves go through `POST /api/dashboards/db`. Grafana enforces authorization at save time, even if permissions change after inspection. Frontend metadata checks are convenience checks, not the security boundary.
- Dashboard reads/searches and Prometheus queries/labels use native Grafana read/proxy endpoints under the same session.
- Tools are explicitly enumerated. Unknown tools, user administration, permission changes, arbitrary HTTP/SQL execution and unsupported mutation families cannot be dispatched.
- HTTP 401/403 errors stop execution. The agent does not retry an authorization failure using another identity or endpoint.
- Dashboard creator identity does not grant exclusive ownership in Grafana. Permissions on dashboards and folders control access. Editors with an explicit Edit grant may edit dashboards created by another user; configure ACLs if stricter isolation is required.

## Conversation storage

Local history is namespaced by Grafana user ID and organization ID. Unattributed legacy history is not migrated or displayed. Without a known identity, persistence is disabled. This prevents accidental cross-login display, but localStorage is not encrypted and cannot protect data from someone controlling the same browser profile, extensions, local machine, or injected same-origin JavaScript. Use separate browser profiles on shared devices.

## Validation and limits

Automated tests cover session endpoint routing, rejected/unknown tool dispatch, forged identity arguments, permission revocation between read and save, immediate termination after a 403, and history namespacing. A live local test confirms the non-admin test user has `canSave=false`, native dashboard save returns HTTP 403 with the dashboard version unchanged, and the shared MCP endpoint returns HTTP 404 after containment.

These checks are not an independent security audit. Other Grafana plugins and endpoints require their own access-control review. Do not re-enable privileged shared MCP for untrusted users. Adding a tool requires a native user-scoped server endpoint and authorization tests before exposing its schema.

## Modified copies and authorization preflight

All requests with an attached dashboard check native save/edit metadata before contacting the model and receive capabilities regardless of language. Read-only investigation remains available. Later-resolved edits refresh permissions before validating mutation payloads. Final saves remain server-authorized.

A read-only source may produce a copy offer only after the current user's creation scopes identify a permitted destination. Dashboard-specific write permission alone is not creation permission. Accepting the offer with the button or an affirmative reply authorizes the offered source and requested changes. The destination is rechecked before model work; a denial is not retried through another identity or folder.

The copy dispatcher re-reads the source, applies changes to an independent clone, clears id/uid/version, and forces overwrite=false. Panel removal supports exact IDs, including nested row panels, in one save. Copies are read back under the same identity before success is reported. Unknown panel IDs are rejected before creation. If destination permission cannot be verified, no copy is offered.

A shared writable folder is not personal isolation. Use folder/dashboard ACLs to control access between users. Frontend checks improve behavior but cannot grant access or replace Grafana's server authorization.
