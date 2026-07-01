import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function footerExtension(pi: ExtensionAPI): void {
  let requestRender: (() => void) | undefined;
  let currentModel: Pick<Model<any>, "id" | "provider" | "reasoning"> | undefined;
  let activeRunStartedAt: number | undefined;
  let lastRunDurationMs: number | undefined;

  function rerender(): void {
    requestRender?.();
  }

  function applyFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
      const timer = setInterval(() => {
        if (activeRunStartedAt) tui.requestRender();
      }, 1000);

      return {
        dispose() {
          clearInterval(timer);
          unsubscribeBranch();
          requestRender = undefined;
        },
        invalidate() { },
        render(width: number): string[] {
          const sep = theme.fg("dim", " • ");
          const ellipsis = theme.fg("dim", "...");
          const padding = 1;
          const innerWidth = Math.max(0, width - padding * 2);

          // ── Left: cwd + git branch ──────────────────────────────────
          const pathParts: string[] = [shortenHome(ctx.cwd)];
          const branch = footerData.getGitBranch();
          if (branch) pathParts.push(`(${branch})`);
          const left = theme.fg("dim", pathParts.join(" "));

          // ── Right: timer • ↑in ↓out • ctx% • model • thinking ───────
          const rightParts: string[] = [];

          // Timer
          const timerStr = renderTimer(theme, activeRunStartedAt, lastRunDurationMs);
          if (timerStr) rightParts.push(timerStr);

          // Token usage (input + output only)
          const usage = renderTokenUsage(theme, ctx);
          if (usage) rightParts.push(usage);

          // Context window percentage only
          const ctxPct = renderContextPercent(theme, ctx);
          if (ctxPct) rightParts.push(ctxPct);

          // Cost
          const cost = renderCost(theme, ctx);
          if (cost) rightParts.push(cost);

          // Model + thinking level
          rightParts.push(renderModel(theme, currentModel, pi.getThinkingLevel()));

          const right = rightParts.join(sep);

          // ── Layout ───────────────────────────────────────────────────
          const minGap = 2;
          const rightWidth = visibleWidth(right);
          const leftMax = Math.max(0, innerWidth - rightWidth - minGap);
          const safeLeft = leftMax > 0 ? truncateToWidth(left, leftMax, ellipsis) : "";
          const safeLeftWidth = visibleWidth(safeLeft);

          let line: string;
          if (safeLeftWidth > 0 && safeLeftWidth + minGap + rightWidth <= innerWidth) {
            const pad = " ".repeat(Math.max(minGap, innerWidth - safeLeftWidth - rightWidth));
            line = safeLeft + pad + right;
          } else {
            line = truncateToWidth(right, innerWidth, ellipsis);
          }

          // Apply 1-char side padding
          const inner = truncateToWidth(line, innerWidth, ellipsis);
          const fill = " ".repeat(Math.max(0, innerWidth - visibleWidth(inner)));
          return [" " + inner + fill + " "];
        },
      };
    });
  }

  function updateModel(model: Model<any> | undefined): void {
    if (!model) return;
    currentModel = { id: model.id, provider: model.provider, reasoning: model.reasoning };
  }

  pi.on("session_start", async (_event, ctx) => {
    updateModel(ctx.model);
    applyFooter(ctx);
    rerender();
  });

  pi.on("model_select", async (event) => {
    updateModel(event.model);
    rerender();
  });

  pi.on("agent_start", async () => {
    activeRunStartedAt = Date.now();
    lastRunDurationMs = undefined;
    rerender();
  });

  pi.on("agent_end", async () => {
    if (activeRunStartedAt) lastRunDurationMs = Date.now() - activeRunStartedAt;
    activeRunStartedAt = undefined;
    rerender();
  });
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function renderTimer(
  theme: ExtensionContext["ui"]["theme"],
  activeRunStartedAt: number | undefined,
  lastRunDurationMs: number | undefined,
): string | undefined {
  if (activeRunStartedAt) {
    return `${theme.fg("accent", "⏱")} ${theme.fg("dim", formatDuration(Date.now() - activeRunStartedAt))}`;
  }
  if (typeof lastRunDurationMs === "number") {
    return `${theme.fg("success", "✓")} ${theme.fg("dim", formatDuration(lastRunDurationMs))}`;
  }
  return undefined;
}

function renderCost(
  theme: ExtensionContext["ui"]["theme"],
  ctx: ExtensionContext,
): string | undefined {
  let cost = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const msg = entry.message as AssistantMessage;
      cost += msg.usage.cost.total;
    }
  }
  if (!cost) return undefined;
  return theme.fg("dim", `$${cost.toFixed(2)}`);
}

function renderTokenUsage(
  theme: ExtensionContext["ui"]["theme"],
  ctx: ExtensionContext,
): string | undefined {
  let input = 0;
  let output = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const msg = entry.message as AssistantMessage;
      input += msg.usage.input;
      output += msg.usage.output;
    }
  }

  if (!input && !output) return undefined;
  const parts: string[] = [];
  if (input) parts.push(`↑${formatTokens(input)}`);
  if (output) parts.push(`↓${formatTokens(output)}`);
  return theme.fg("dim", parts.join(" "));
}

function renderContextPercent(
  theme: ExtensionContext["ui"]["theme"],
  ctx: ExtensionContext,
): string | undefined {
  const usage = ctx.getContextUsage();
  if (!usage || usage.percent === null) return undefined;

  const pct = usage.percent;
  const text = `${pct.toFixed(1)}%`;

  if (pct > 90) return theme.fg("error", text);
  if (pct > 70) return theme.fg("warning", text);
  return theme.fg("dim", text);
}

function renderModel(
  theme: ExtensionContext["ui"]["theme"],
  model: Pick<Model<any>, "id" | "provider" | "reasoning"> | undefined,
  thinkingLevel: string,
): string {
  if (!model) return theme.fg("dim", "no-model");
  let label = model.id;
  if (model.reasoning) {
    label += thinkingLevel === "off" ? " • thinking off" : ` • ${thinkingLevel}`;
  }
  return theme.fg("dim", label);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortenHome(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}
