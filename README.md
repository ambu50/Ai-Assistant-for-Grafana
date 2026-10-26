# AI Assistant for Grafana

A Grafana app for investigating metrics, finding dashboards, and making dashboard changes through conversational tasks. Model completions use [grafana-llm-app](https://github.com/grafana/grafana-llm-app); resource tools use native Grafana APIs as the signed-in user.

This is an independent project, not the official Grafana Assistant. Current version: **1.0.0**. The running version is visible in the app.

## Features

- Chat from the main app, a dashboard panel menu, or Grafana's command palette.
- Attach a dashboard using `@` or **@ Dashboard**, and a source using **＋ Data source**.
- Search and inspect dashboards, query Prometheus, and create or update classic dashboards.
- Follow task plans, tool activity, and progress while the model works. Stop active tasks when needed.
- Execute authorized tasks without repeated per-tool approval prompts.
- Check permissions before model planning for edit requests on an attached dashboard.
- Offer modified copies of read-only dashboards only when a permitted destination can be verified. Accept with **Create modified copy**, “ok,” “yes,” or “go ahead.”
- Store conversations and checkpoints in the browser, scoped to the Grafana user and organization.

## Requirements

- Node.js 22+ and npm for building.
- Grafana 12+. Local authorization checks were exercised on Grafana 13.2.4; compatibility with every version has not been verified.
- `grafana-llm-app` 0.22+ installed, enabled, and configured with a provider supporting OpenAI-style tool calling.
- Docker Compose for the optional development environment.

Provider URLs, credentials, and model selection belong in the LLM plugin. AI Assistant does not require a particular local model.

## Quick start

From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
docker compose up -d
```

1. Open [Grafana](http://localhost:3000). A fresh Compose instance uses Grafana's initial `admin` / `admin` credentials and asks you to change the password.
2. Open **Administration → Plugins → LLM**, configure your provider, and test the connection.
3. Before enabling access for multiple users, disable the LLM plugin's shared MCP server while preserving its provider configuration. See [SECURITY.md](SECURITY.md).
4. Open [AI Assistant](http://localhost:3000/a/ai-assistant-app).

Compose uses Grafana 12.3.0, mounts `dist/`, provisions both apps, and persists Grafana data in a named volume. The LLM plugin is downloaded at startup, requiring internet access on first use. Pin its version for reproducible deployments.

For development, run `npm run dev` and refresh Grafana after the rebuild.

## Existing Grafana installation

1. Run `npm ci` and `npm run build`.
2. Copy the **contents** of `dist/` into `/var/lib/grafana/plugins/ai-assistant-app/`, or the equivalent plugin directory in your installation.
3. Install and configure `grafana-llm-app`. Apply the shared MCP containment in [SECURITY.md](SECURITY.md).
4. For an unsigned development build, add `ai-assistant-app` to `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`, preserving existing entries.
5. Restart Grafana and enable AI Assistant for the intended organization. The example [apps.yaml](provisioning/plugins/apps.yaml) provisions organization 1.

Production distribution requires Grafana plugin signing and appropriate deployment review. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Usage

### Attach context

Type `@` or click **@ Dashboard**, search for a dashboard, and select it. A removable chip confirms the attachment. Use **＋ Data source** to attach a source by name or type. Only the source UID, name, and type are attached. Dashboard and data source attachments can coexist; existing dashboard bindings are not silently replaced.

Describe the outcome you want, for example:

- “Explain why this dashboard has no data when I select one instance.”
- “Remove the Average uptime panel from the attached dashboard.”
- “Use the attached Prometheus data source to investigate CPU usage over the last hour.”

Optional notes are available under **Additional context**.

### Chat from a dashboard

Open a panel menu → **Extensions → Ask AI Assistant**. The chat receives a snapshot of the dashboard UID/title, panel identity and queries, selected time range, and URL variable values.

Alternatively, open Grafana's command palette with **Cmd/Ctrl+K** and select **AI Assistant chat**. **Open full assistant** opens the saved conversation in the main app.

The app uses panel-menu and command-palette integrations. It does not install a native top-bar icon or modify Grafana core.

### Permissions and modified copies

Grafana permissions apply to resource requests and the final save. Creator identity is not an ownership boundary: users with Edit permission may modify dashboards created by someone else.

For an edit request on an attached dashboard, the app checks native save/edit metadata before contacting the model. If the source is read-only, it checks creation scopes before offering a copy. The offer is bound to a permitted folder; acceptance rechecks that destination before model work. If no destination can be verified, the assistant explains the restriction immediately.

A modified copy uses a new dashboard identity, overwrite disabled, and read-back verification. Exact panel IDs can be removed, including nested row panels, in one save. The original stays unchanged.

Viewers can create copies when granted suitable destination-folder permissions, for example in a **Users** folder. No folder name is hardcoded. Shared Edit access can allow users to modify each other's dashboards inside that folder; use separate folder ACLs for personal isolation.

## Testing

```sh
npm run typecheck
npm test
npm run build
```

Tests cover tool dispatch, authorization preflight, copy acceptance and destination scopes, source preservation, patches, read-back verification, task dependencies, cancellation, and user-scoped storage.

The optional live authorization test is skipped unless all these environment variables are set:

| Variable | Purpose |
| --- | --- |
| `AI_TEST_GRAFANA_URL` | Test Grafana base URL |
| `AI_TEST_USER` | Dedicated restricted test account |
| `AI_TEST_PASSWORD` | Test account password; keep outside Git |
| `AI_TEST_READONLY_DASHBOARD_UID` | Dashboard readable but not editable by that account |

Run it with `npm exec -- vitest run tests/authorization.integration.test.ts`. The test account must have no dashboard creation destination, and shared MCP must be disabled. Use a disposable test instance: the test submits the original, unchanged dashboard to verify Grafana rejects the save, after asserting read-only metadata.

Unit tests do not establish compatibility with every provider. Test tool calling and permitted writes with your Grafana/LLM combination before deployment.

## Limitations

- Resource tools cover classic dashboards, data source identities, and Prometheus queries/labels. Alert administration, Loki, arbitrary HTTP/SQL execution, and trace visualization are not exposed.
- There is no application-wide step or model-round cap. Provider context/output limits and timeouts still apply. Tool results sent to the model are capped at 24,000 characters per call.
- Responses appear when a model turn completes, rather than token streaming. Progress describes execution activity, not private model reasoning.
- Dashboard context is a launch-time snapshot, not continuous synchronization. Edits refresh current state before saving.
- Active tasks survive Grafana SPA navigation but not a full reload. Checkpoints allow continuation unless authorization blocks the task.
- Stop prevents subsequent steps; an in-flight request or already-submitted save may finish.
- Up to 30 conversations are stored in unencrypted browser `localStorage`. Conversation context and tool results are sent to the configured provider. See [SECURITY.md](SECURITY.md).
- Read-back verifies saved configuration; it does not prove every panel query returns useful data.

## References

- [Grafana LLM plugin](https://github.com/grafana/grafana-llm-app)
- [Grafana app plugin LLM integration](https://grafana.com/developers/plugin-tools/how-to-guides/app-plugins/use-llms-and-mcp)
- [Official Grafana Assistant](https://grafana.com/grafana/plugins/grafana-assistant-app/)
