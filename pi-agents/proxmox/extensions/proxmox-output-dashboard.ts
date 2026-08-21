import { createServer, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TARGET_PATTERN = /(?:^|\s)(think-[12]|root@192\.168\.3\.(?:160|148))(?:\s|$)/;
const MAX_COMMANDS = 20;

type CommandStatus = "running" | "complete" | "failed";

type RemoteCommand = {
  id: string;
  target: string;
  command: string;
  output: string;
  status: CommandStatus;
  startedAt: number;
  endedAt?: number;
};

function parseRemoteCommand(command: string): { target: string; command: string } | undefined {
  if (!/(?:^|[;&|]\s*)ssh\s/.test(command)) return undefined;

  const target = command.match(TARGET_PATTERN);
  if (!target?.[1] || target.index === undefined) return undefined;

  let remote = command.slice(target.index + target[0].length).trim();
  if (
    remote.length >= 2 &&
    ((remote.startsWith("'") && remote.endsWith("'")) ||
      (remote.startsWith('"') && remote.endsWith('"')))
  ) {
    remote = remote.slice(1, -1).trim();
  }

  return { target: target[1], command: remote || "Interactive SSH session" };
}

function sanitizeTerminalOutput(output: string): string {
  return output
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[@-_]/g, "")
    .replace(/\r(?!\n)/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g, "");
}

function textFromResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content.find(
    (item): item is { type: "text"; text: string } =>
      Boolean(item) &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  );
  return text ? sanitizeTerminalOutput(text.text) : undefined;
}

function dashboardHtml(token: string, nonce: string): string {
  const eventsPath = `/${token}/events`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Proxmox command output</title>
  <style nonce="${nonce}">
    /* Hallmark · pre-emit critique: P5 H4 E5 S5 R5 V4
     * Hallmark · genre: modern-minimal · macrostructure: Workbench · tone: technical-austere · theme: terminal
     * contrast: pass (40–41) · chrome: pass (47) · tokens: pass (48) · mobile: pass (34, 49–57)
     */
    :root {
      --color-paper: oklch(14% 0.012 255);
      --color-surface: oklch(18% 0.014 255);
      --color-surface-raised: oklch(21% 0.016 255);
      --color-rule: oklch(31% 0.018 255);
      --color-muted: oklch(67% 0.018 255);
      --color-ink: oklch(92% 0.012 255);
      --color-accent: oklch(78% 0.16 155);
      --color-warning: oklch(80% 0.13 85);
      --color-error: oklch(70% 0.18 28);
      --font-display: "SFMono-Regular", Menlo, Monaco, ui-monospace, monospace;
      --font-body: ui-sans-serif, system-ui, sans-serif;
      --space-2xs: 0.25rem;
      --space-xs: 0.5rem;
      --space-sm: 0.75rem;
      --space-md: 1rem;
      --space-lg: 1.5rem;
      --space-xl: 2.5rem;
      --space-2xl: 4rem;
      --text-xs: 0.75rem;
      --text-sm: 0.875rem;
      --text-base: 1rem;
      --text-lg: 1.25rem;
      --rule-thin: 1px;
      --radius-sm: 0.375rem;
      --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
      --dur-micro: 120ms;
    }

    * { box-sizing: border-box; }
    html, body { overflow-x: clip; }
    body {
      margin: 0;
      min-width: 20rem;
      min-height: 100vh;
      color: var(--color-ink);
      background: var(--color-paper);
      font-family: var(--font-body);
      font-size: var(--text-base);
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: var(--space-lg);
      padding: var(--space-lg) clamp(var(--space-md), 4vw, var(--space-xl));
      border-bottom: var(--rule-thin) solid var(--color-rule);
      background: var(--color-paper);
    }

    h1 {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
      font-family: var(--font-display);
      font-size: clamp(var(--text-lg), 2vw, 1.75rem);
      font-style: normal;
      letter-spacing: -0.03em;
      line-height: 1.15;
    }

    .connection {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-muted);
      font-family: var(--font-display);
      font-size: var(--text-xs);
      white-space: nowrap;
    }

    .connection::before {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--color-accent);
      content: "";
    }

    .connection.is-offline::before { background: var(--color-error); }

    main {
      display: grid;
      gap: var(--space-lg);
      width: min(100%, 112rem);
      margin-inline: auto;
      padding: var(--space-xl) clamp(var(--space-md), 4vw, var(--space-xl)) var(--space-2xl);
    }

    .empty {
      max-width: 55ch;
      margin: var(--space-2xl) 0;
      color: var(--color-muted);
      line-height: 1.6;
    }

    .command {
      min-width: 0;
      border: var(--rule-thin) solid var(--color-rule);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }

    .command__meta {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: var(--rule-thin) solid var(--color-rule);
      background: var(--color-surface-raised);
    }

    .target, .status, .elapsed {
      font-family: var(--font-display);
      font-size: var(--text-xs);
      font-variant-numeric: tabular-nums;
    }

    .target { color: var(--color-accent); }
    .status { color: var(--color-warning); }
    .command[data-status="complete"] .status { color: var(--color-accent); }
    .command[data-status="failed"] .status { color: var(--color-error); }
    .elapsed { color: var(--color-muted); text-align: right; }

    .command__line {
      min-width: 0;
      overflow: hidden;
      color: var(--color-muted);
      font-family: var(--font-display);
      font-size: var(--text-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    pre {
      min-height: 9rem;
      max-height: 52vh;
      margin: 0;
      overflow: auto;
      padding: var(--space-md);
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: clamp(var(--text-xs), 1vw, var(--text-sm));
      font-variant-numeric: tabular-nums;
      line-height: 1.55;
      tab-size: 4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    @media (max-width: 42rem) {
      header { grid-template-columns: minmax(0, 1fr); align-items: start; }
      .command__meta { display: flex; flex-wrap: wrap; }
      .command__meta > div:last-child { margin-left: auto; white-space: nowrap; }
      .command__line { order: 3; flex-basis: 100%; }
      pre { max-height: 60vh; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: var(--dur-micro) !important;
        animation-iteration-count: 1 !important;
        transition-duration: var(--dur-micro) !important;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Proxmox command output</h1>
    <div class="connection" id="connection">Live connection</div>
  </header>
  <main id="commands">
    <p class="empty" id="empty">Waiting for SSH output from think-1 or think-2. This page is read-only and available only from this machine.</p>
  </main>
  <script nonce="${nonce}">
    const container = document.querySelector("#commands");
    const empty = document.querySelector("#empty");
    const connection = document.querySelector("#connection");
    const nodes = new Map();
    let commands = [];

    function elapsed(command) {
      const end = command.endedAt || Date.now();
      return ((end - command.startedAt) / 1000).toFixed(1) + "s";
    }

    function createCommand(command) {
      const article = document.createElement("article");
      article.className = "command";
      article.innerHTML = '<div class="command__meta"><span class="target"></span><div class="command__line"></div><div><span class="status"></span> <span class="elapsed"></span></div></div><pre></pre>';
      nodes.set(command.id, article);
      return article;
    }

    function render(nextCommands) {
      commands = nextCommands;
      empty.hidden = commands.length > 0;

      const activeIds = new Set(commands.map((command) => command.id));
      for (const [id, node] of nodes) {
        if (!activeIds.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }

      for (const command of commands) {
        const node = nodes.get(command.id) || createCommand(command);
        const output = node.querySelector("pre");
        const shouldFollow = output.scrollHeight - output.scrollTop - output.clientHeight < 80;
        node.dataset.status = command.status;
        node.querySelector(".target").textContent = command.target;
        node.querySelector(".command__line").textContent = "$ " + command.command;
        node.querySelector(".status").textContent = command.status;
        node.querySelector(".elapsed").textContent = elapsed(command);
        output.textContent = command.output || "Waiting for output…";
        if (shouldFollow) output.scrollTop = output.scrollHeight;
        container.append(node);
      }
    }

    setInterval(() => {
      for (const command of commands) {
        const node = nodes.get(command.id);
        if (node) node.querySelector(".elapsed").textContent = elapsed(command);
      }
    }, 1000);

    const source = new EventSource(${JSON.stringify(eventsPath)});
    source.addEventListener("snapshot", (event) => render(JSON.parse(event.data)));
    source.onopen = () => {
      connection.textContent = "Live connection";
      connection.classList.remove("is-offline");
    };
    source.onerror = () => {
      connection.textContent = "Reconnecting…";
      connection.classList.add("is-offline");
    };
  </script>
</body>
</html>`;
}

export default function registerProxmoxOutputDashboard(pi: ExtensionAPI): void {
  const pending = new Map<string, { target: string; command: string; startedAt: number }>();
  const commands = new Map<string, RemoteCommand>();
  const clients = new Set<ServerResponse>();
  const token = randomBytes(24).toString("hex");
  const nonce = randomBytes(18).toString("base64");
  let server: Server | undefined;
  let serverUrl: string | undefined;
  let startingServer: Promise<string> | undefined;
  let browserOpened = false;
  let heartbeat: NodeJS.Timeout | undefined;

  const snapshot = (): RemoteCommand[] => [...commands.values()];

  const broadcast = (): void => {
    const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
    for (const client of clients) client.write(payload);
  };

  const startServer = (): Promise<string> => {
    if (serverUrl) return Promise.resolve(serverUrl);
    if (startingServer) return startingServer;

    const startPromise = new Promise<string>((resolve, reject) => {
      const nextServer = createServer((request, response) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        const pagePath = `/${token}/`;
        const eventsPath = `/${token}/events`;

        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");

        if (request.method === "GET" && requestUrl.pathname === pagePath) {
          response.setHeader(
            "Content-Security-Policy",
            `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
          );
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(dashboardHtml(token, nonce));
          return;
        }

        if (request.method === "GET" && requestUrl.pathname === eventsPath) {
          response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            Connection: "keep-alive",
            "Cache-Control": "no-store",
          });
          clients.add(response);
          response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
          request.on("close", () => clients.delete(response));
          return;
        }

        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Not found");
      });

      nextServer.once("error", reject);
      nextServer.listen(0, "127.0.0.1", () => {
        server = nextServer;
        const address = nextServer.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}/${token}/`;
        heartbeat = setInterval(() => {
          for (const client of clients) client.write(": keepalive\n\n");
        }, 15_000);
        resolve(serverUrl);
      });
    }).finally(() => {
      startingServer = undefined;
    });

    startingServer = startPromise;
    return startPromise;
  };

  const openDashboard = async (force = false): Promise<void> => {
    const url = await startServer();
    if (browserOpened && !force) return;

    const result = process.platform === "darwin"
      ? await pi.exec("open", ["-a", "Google Chrome", url])
      : await pi.exec("xdg-open", [url]);

    if (result.code === 0) {
      browserOpened = true;
      return;
    }

    browserOpened = true;
    throw new Error(result.stderr.trim() || "Could not open the dashboard in a browser");
  };

  pi.on("tool_execution_start", (event) => {
    if (event.toolName !== "bash") return;
    const command = (event.args as { command?: unknown } | undefined)?.command;
    if (typeof command !== "string") return;
    const remote = parseRemoteCommand(command);
    if (!remote) return;
    pending.set(event.toolCallId, { ...remote, startedAt: Date.now() });
  });

  pi.on("tool_execution_update", async (event, ctx) => {
    const remote = pending.get(event.toolCallId);
    if (!remote || event.toolName !== "bash") return;

    let command = commands.get(event.toolCallId);
    if (!command) {
      command = {
        id: event.toolCallId,
        ...remote,
        output: "",
        status: "running",
      };
      commands.set(event.toolCallId, command);
      while (commands.size > MAX_COMMANDS) {
        const oldest = commands.keys().next().value as string | undefined;
        if (!oldest) break;
        commands.delete(oldest);
      }

      try {
        await openDashboard();
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }

    command.output = textFromResult(event.partialResult) ?? command.output;
    broadcast();
  });

  pi.on("tool_execution_end", (event) => {
    pending.delete(event.toolCallId);
    const command = commands.get(event.toolCallId);
    if (!command || event.toolName !== "bash") return;

    command.output = textFromResult(event.result) ?? command.output;
    command.status = event.isError ? "failed" : "complete";
    command.endedAt = Date.now();
    broadcast();
  });

  pi.registerCommand("proxmox-output", {
    description: "Open the live Proxmox SSH output dashboard in Chrome",
    handler: async (_args, ctx) => {
      try {
        await openDashboard(true);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.on("session_shutdown", async () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    for (const client of clients) client.end();
    clients.clear();
    pending.clear();
    commands.clear();

    const currentServer = server;
    server = undefined;
    serverUrl = undefined;
    if (!currentServer) return;
    await new Promise<void>((resolve) => currentServer.close(() => resolve()));
  });
}
