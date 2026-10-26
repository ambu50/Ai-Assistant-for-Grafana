# AI Assistant deployment

Version 1.0.0 uses plugin ID `ai-assistant-app` and route `/a/ai-assistant-app`.

Build with `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
Copy `dist/` into Grafana's plugin directory under `ai-assistant-app`.
Install and configure `grafana-llm-app`. For unsigned development builds, add only
`ai-assistant-app` to Grafana's unsigned plugin allowlist. Provision the app using
`provisioning/plugins/apps.yaml`, enable it for the intended organization, and
restart Grafana.

The source is provider-independent. Model configuration and provider credentials
belong to `grafana-llm-app`. No model endpoints or credentials are embedded here.

Grafana panel menus expose **Ask AI Assistant**. The command palette exposes
**AI Assistant chat**. The main page supports dashboard and datasource attachments.


## Multi-user configuration

Resource tools use native Grafana APIs with the signed-in session. The app uses `grafana-llm-app` for model completions only. Dashboard and folder permissions remain enforced by Grafana on every save. No additional LLM plugin configuration is required beyond a working model provider.

## Folder permissions and copies

The app discovers permitted copy destinations from current-user creation scopes, not folder names. To let Viewers create copies while keeping shared dashboards read-only, grant appropriate access to a destination folder. Shared Edit access allows collaboration inside that folder; use separate ACLs for personal isolation.

Read-only sources receive copy offers only when a permitted destination can be verified. Acceptance is scoped to the source, requested changes, and destination. Destination permission is rechecked before model work, and Grafana authorizes the actual save. Copies use new identities and overwrite=false, and are read back for verification.

## Deployment validation

Test tool calling with the configured provider, an allowed edit, a read-only source with a writable destination, and a user with neither edit nor creation permission. The optional live negative authorization test is documented in [README.md](README.md).

User/organization-scoped browser history intentionally does not import unattributed legacy conversations. Active tasks survive SPA navigation but not a full browser reload. Production distribution requires plugin signing; the included Compose setup is for development.
