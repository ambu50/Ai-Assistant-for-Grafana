# AI Assistant deployment

Version 2.0.0 uses plugin ID `ai-assistant-app` and route `/a/ai-assistant-app`.

Build with `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
Copy `dist/` into Grafana's plugin directory under `ai-assistant-app`.
Install and configure `grafana-llm-app`. For unsigned development builds, add only
`ai-assistant-app` to Grafana's unsigned plugin allowlist. Provision the app using
`provisioning/plugins/apps.yaml`, enable it for the intended organization, and
restart Grafana.

The source is provider-independent. Model configuration and MCP authentication
belong to `grafana-llm-app`. No model endpoints or credentials are embedded here.

Grafana panel menus expose **Ask AI Assistant**. The command palette exposes
**AI Assistant chat**. The main page supports dashboard and datasource attachments.


## 2.1.0 security change

Model completions still use grafana-llm-app. Resource tools now use native Grafana API requests with the signed-in session; the privileged shared MCP transport has been removed. The local deployment has a dedicated ai-assistant-llm-security provisioning ConfigMap with MCP disabled and provider configuration preserved. Other apps using the shared MCP service lose those tools until a user-scoped replacement is configured.

See SECURITY.md for the authorization boundary and deployment requirements. The live non-admin test user had canSave=false; native save returned HTTP 403 without changing dashboard version, and shared MCP initialization returned HTTP 404. User/organization-scoped history intentionally does not import unattributed legacy conversations.

## 2.2.0 modified-copy fallback

After a denied dashboard edit, the assistant rechecks readability and offers Create modified copy. It never copies automatically on denial. The action persists with the conversation and submits an explicit copy request. The copy dispatcher clears id/uid/version, forces overwrite=false, preserves unaffected settings, and applies requested patch operations to a separate model. Grafana authorizes destination creation; source and destination failures do not use alternate identities. The agent reads back and verifies the new UID before reporting success.

Regression tests cover the offer without automatic creation, persisted action, fresh identity, source preservation, destination denial, unreadable sources and copy read-back verification.
