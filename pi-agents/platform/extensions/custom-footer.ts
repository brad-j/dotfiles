import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function formatNumber(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (value >= 1_000) {
        return `${Math.round(value / 1_000)}k`;
    }
    return String(value);
}

function formatCwd(cwd: string): string {
    const home = homedir();
    const fromHome = relative(home, cwd);
    const insideHome =
        fromHome === "" ||
        (fromHome !== ".." && !fromHome.startsWith(`..${sep}`) && !isAbsolute(fromHome));

    if (!insideHome) return cwd;
    return fromHome === "" ? "~" : `~${sep}${fromHome}`;
}

/** Replaces Pi's default footer with a compact project and model status line. */
export default function registerCustomFooter(pi: ExtensionAPI): void {
    pi.on("session_start", (_event, ctx) => {
        if (ctx.mode !== "tui") return;

        const handoffAvailable = pi.getCommands().some(
            (command) => command.name === "handoff" && command.source === "extension",
        );

        ctx.ui.setFooter((tui, theme, footerData) => {
            const unsubscribeFromBranch = footerData.onBranchChange(() => tui.requestRender());

            return {
                dispose: unsubscribeFromBranch,
                invalidate() { },
                render(width: number): string[] {
                    const horizontalInset = width >= 3 ? 1 : 0;
                    const edgePadding = " ".repeat(horizontalInset);
                    const contentWidth = width - horizontalInset * 2;

                    const branch = footerData.getGitBranch();
                    const usage = ctx.getContextUsage();
                    const percent = usage?.percent;
                    const contextWindow = formatNumber(
                        usage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
                    );

                    const projectSeparator = theme.fg("accent", "  ◆  ");
                    const sectionSeparator = theme.fg("borderMuted", "  ┊  ");
                    const detailSeparator = theme.fg("borderMuted", "  ┊  ");
                    const cwd = theme.bold(theme.fg("accent", formatCwd(ctx.cwd)));
                    const git = branch ? theme.fg("muted", branch) : "";
                    const left = branch ? [cwd, git].join(projectSeparator) : cwd;

                    const model = theme.fg("text", ctx.model?.name ?? "no model");
                    const thinking = theme.fg("muted", ctx.thinkingLevel ?? "off");
                    const contextColor =
                        percent == null ? "dim" : percent > 90 ? "error" : percent >= 70 ? "warning" : "accent";
                    const context = theme.fg(
                        contextColor,
                        percent == null ? `?/${contextWindow}` : `${percent.toFixed(0)}%/${contextWindow}`,
                    );
                    const runtime = [model, thinking].join(detailSeparator) + sectionSeparator + context;
                    const handoff = handoffAvailable && percent != null && percent >= 70
                        ? theme.bold(theme.fg("error", "↪ /handoff"))
                        : "";
                    let right = handoff ? handoff + sectionSeparator + runtime : runtime;

                    if (contentWidth < 30) {
                        const fitted = truncateToWidth(left, contentWidth, theme.fg("dim", "…"));
                        return [`${edgePadding}${fitted}${edgePadding}`];
                    }

                    const minimumLeftWidth = Math.min(20, Math.floor(contentWidth * 0.4));
                    const maximumRightWidth = Math.max(0, contentWidth - minimumLeftWidth - 2);
                    right = truncateToWidth(right, maximumRightWidth, "");

                    const rightWidth = visibleWidth(right);
                    const maximumLeftWidth = Math.max(0, contentWidth - rightWidth - 2);
                    const fittedLeft = truncateToWidth(left, maximumLeftWidth, theme.fg("dim", "…"));
                    const padding = " ".repeat(
                        Math.max(2, contentWidth - visibleWidth(fittedLeft) - rightWidth),
                    );
                    const content = truncateToWidth(fittedLeft + padding + right, contentWidth, "");

                    return [`${edgePadding}${content}${edgePadding}`];
                },
            };
        });
    });
}
