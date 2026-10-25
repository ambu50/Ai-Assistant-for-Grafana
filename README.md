# AI Assistant for Grafana

A native Grafana app inspired by Grafana Assistant's investigation, discovery, query-help and dashboard workflows. This is an independent implementation, not Grafana's official Assistant or a feature-complete clone.

## Run locally

Requires Node.js 22+, npm, Docker Compose, Grafana 12+, and `grafana-llm-app` 0.22+ with a configured provider. Your provider must support OpenAI-style tool calling for MCP investigations.

```sh
npm ci
npm run typecheck
npm test
npm run build
docker compose up -d
```

1. Open http://localhost:3000 and sign into Grafana (a fresh local instance starts with admin/admin and requests a password change).
2. Open **Administration → Plugins → LLM**, configure your provider, and test the connection. Credentials belong in the LLM plugin, never in this app's source or browser storage.
3. Enable/configure Grafana MCP in the LLM plugin for live data tools. Available tools depend on your installation and permissions.
4. Open http://localhost:3000/a/ai-assistant-app.

The Compose setup downloads the LLM plugin at startup and persists Grafana configuration in a named volume. Internet access is required on first start. For reproducible deployments, pin the LLM plugin to your tested version. `npm run dev` rebuilds local changes; reload Grafana afterward.

## Existing Grafana installation

Copy the contents of `dist/` into `/var/lib/grafana/plugins/ai-assistant-app/`. Install and enable `grafana-llm-app`, configure its provider and MCP, allow the development plugin using `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=ai-assistant-app`, and restart Grafana. Enable AI Assistant in plugin administration. Production distribution requires Grafana plugin signing; do not enable broad unsigned-plugin loading.

## Chat while viewing a dashboard

Open a panel menu → **Extensions → Ask AI Assistant** to chat in a modal over the dashboard. Dashboard UID/title, panel identity and queries, selected time range, and URL variable values are attached as a snapshot. The default time-window choice is **Dashboard time range**. The request can explicitly reference a different dashboard if needed.

You can also use Grafana's command palette (Cmd/Ctrl+K), search for **AI Assistant chat**, and open a conversation with the current dashboard UID, time range, and URL variables. Conversations are scoped to the dashboard and persist when the chat closes; a running task continues within the current Grafana SPA. **Open full assistant** opens the main app with the saved conversation.

The plugin preloads only its small registration module; the chat loads on demand. These are supported panel-menu and command-palette extensions. Grafana 13.2.4 restricts native top-bar and extension-sidebar components to its own allowlisted plugins, so this app does not register a native toolbar icon or patch Grafana core. See `DEPLOYMENT.md` for the inspected upstream source paths.

## Behavior

- Multi-turn Markdown chat with dashboard attachments and optional notes. The composer uses your provider’s default reasoning behavior. Time ranges come from your request or a captured dashboard view; there are no time-window or thinking-effort selectors.
- Model requests use `@grafana/llm` through `grafana-llm-app`; no direct provider calls or embedded credentials.
- MCP tools are discovered dynamically. The agent can inspect metrics, logs, dashboards and alerts when the server exposes those tools. Dashboard creation/editing likewise requires an appropriate MCP tool.
- Tools advertised by MCP execute automatically within the requested task, including writes. There are no per-tool approval dialogs. The model is instructed to ask only for essential missing information or actions outside the requested scope. Grafana permissions remain enforced server-side.
- Tasks have no application-wide round or step cap. Tool results sent back to the model are summarized to 24,000 characters per call. Provider context/output limits and timeouts still apply. Provider errors are visible and MCP unavailability permits advice-only responses.
- Complex tasks use a visible dependency checklist, executed immediately. Step completion is checked against tool evidence; failed prerequisites block dependent work. Plans and query evidence persist with conversations.
- Dashboard edits refresh the current dashboard/version, retain omitted settings and panels unless removal is requested, and read back saved panels, settings and query references. Full dashboard saves and simple JSON Pointer/JSONPath patches are supported; unsupported patch selectors are rejected before mutation. Configuration verification is distinct from runtime query validation.
- Interrupted tasks retain a checkpoint and offer **Continue unfinished task**. A full page reload interrupts execution; continuation inspects current resources before edits rather than replaying an uncertain write.
- Stop prevents subsequent model/tool steps; an in-flight request or already submitted mutation may finish. Responses appear when each model turn completes, rather than token streaming.
- When a provider reports the response was cut off at its output limit, the agent does not execute truncated tool calls; it flags the limit and asks the model to split the work into smaller steps. Conversations are stored in the browser's `localStorage` (up to the most recent 30) and persist across reloads. New conversation starts a fresh one; delete removes it. Conversation and tool output are sent to the provider configured by your Grafana administrator. Grafana server permissions remain the authorization boundary.

## Limits and validation

Trace visualization and official Assistant extension APIs are not included. Dashboard context is captured when launching the chat from a panel or command palette; it is a snapshot, not continuous dashboard-state synchronization. Chat history and execution checkpoints are stored in the browser; active runs survive navigation within the Grafana SPA, but not a full page reload. This app uses native Grafana navigation and supports subpath installations. It renders Markdown without raw HTML.

Unit tests exercise automatic multi-step execution, unadvertised-tool rejection, cancellation beyond eight rounds, dependency validation, execution evidence, dashboard verification, checkpoint persistence, and argument validation. Integration requires a running Grafana instance with LLM credentials and MCP; compilation alone does not verify provider behavior or server permissions.

## References

- [Grafana Assistant workflows](https://grafana.com/grafana/plugins/grafana-assistant-app/)
- [Use LLMs and Grafana MCP in app plugins](https://grafana.com/developers/plugin-tools/how-to-guides/app-plugins/use-llms-and-mcp)
- [Grafana LLM plugin](https://github.com/grafana/grafana-llm-app)

### Choose dashboard context from the assistant page

Type `@` in your message or click **@ Dashboard**, search a dashboard name, and select it. The picker lists dashboards visible to your current Grafana user, with folders and UIDs to distinguish duplicate names. Use arrow keys and Enter to select, Escape to close, or Load more for additional results. The selected dashboard appears as a chip in the composer and is saved with it. Selecting another replaces the attachment; the chip’s **×** button clears it. Selection attaches a UID, not a cached dashboard JSON; the agent fetches current details before edits. Dashboard selection does not impose a time range; include one in your request when it matters.

### Focused conversation UI

The welcome screen provides task guidance without auto-submitting prompts. Attach a dashboard, describe the outcome you want, and send. Optional notes live under **Additional context**. Slash commands, preset prompt cards, time-window and thinking-effort selectors have been removed. Existing conversations and dashboard attachments remain available.

### Attach a data source

Click **＋ Data source** below the message box, search by name or type, and choose a source. A removable chip shows its name and type. Dashboard and datasource attachments can coexist and are saved with each conversation; a new conversation starts without an explicit datasource selection. Only the source's UID, name and type are included in the model context. The assistant uses it as the default query source without silently changing existing dashboard datasource bindings.
