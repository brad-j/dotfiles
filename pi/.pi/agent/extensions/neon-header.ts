import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Rgb = [number, number, number];
type ResourceCard = {
  title: string;
  icon: string;
  count: number;
  unit: string;
  items: string[];
  note?: string;
  phase: number;
};

type MaybeContainer = {
  children?: unknown[];
  clear?: () => void;
  render?: (width: number) => string[];
  requestRender?: () => void;
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const MAX_CARD_ITEMS = 10;

// Compact enough to stay tasteful above the dashboard cards.
const LOGO = [
  "██████╗  ██╗",
  "██╔══██╗ ██║",
  "██████╔╝ ██║",
  "██╔═══╝  ██║",
  "██║      ██║",
  "╚═╝      ╚═╝",
];

// Tokyo Night palette: storm foregrounds + signature blue/cyan/purple accents.
const PALETTE: Rgb[] = [
  [122, 162, 247], // blue
  [125, 207, 255], // cyan
  [187, 154, 247], // purple
  [247, 118, 142], // red/rose
  [224, 175, 104], // orange
  [158, 206, 106], // green
  [122, 162, 247], // loop
];

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function sampleGradient(position: number): Rgb {
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * (PALETTE.length - 1);
  const index = Math.floor(scaled);
  const t = scaled - index;
  const a = PALETTE[index]!;
  const b = PALETTE[Math.min(index + 1, PALETTE.length - 1)]!;
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function fg([r, g, b]: Rgb, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function gradient(text: string, phase: number): string {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      return fg(sampleGradient(index / span + phase), char);
    })
    .join("");
}

function fitLine(text: string, width: number, ellipsis = ""): string {
  return truncateToWidth(text, Math.max(0, width), ellipsis);
}

function padAnsi(text: string, width: number, ellipsis = "…"): string {
  const safe = fitLine(text, width, ellipsis);
  return safe + " ".repeat(Math.max(0, width - visibleWidth(safe)));
}

function centerAnsi(text: string, width: number): string {
  if (width <= 0) return "";
  const safe = fitLine(text, width, "");
  const len = visibleWidth(safe);
  if (len >= width) return safe;
  return `${" ".repeat(Math.floor((width - len) / 2))}${safe}`;
}

function shortenHome(value: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

function projectName(cwd: string): string {
  return path.basename(cwd) || "session";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function displayNameFromPath(value: string): string {
  const parsed = path.parse(value);
  if (parsed.name === "index") return path.basename(path.dirname(value));
  if (parsed.base === "SKILL.md") return path.basename(path.dirname(value));
  return parsed.name || parsed.base || value;
}

function readSkillName(skillFile: string): string | undefined {
  try {
    const text = readFileSync(skillFile, "utf8").slice(0, 2048);
    const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
    const frontmatter = match?.[1];
    const name = frontmatter?.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

function scanExtensionRoot(root: string): string[] {
  try {
    if (!existsSync(root)) return [];
    const names: string[] = [];
    for (const entry of readdirSync(root)) {
      if (entry.startsWith(".")) continue;
      const full = path.join(root, entry);
      const stat = statSync(full);
      if (stat.isFile() && /\.[cm]?[tj]s$/.test(entry)) {
        names.push(path.parse(entry).name);
      } else if (stat.isDirectory()) {
        const hasIndex = ["index.ts", "index.js", "index.mts", "index.mjs", "index.cts", "index.cjs"].some((name) =>
          existsSync(path.join(full, name)),
        );
        if (hasIndex) names.push(entry);
      }
    }
    return names;
  } catch {
    return [];
  }
}

function scanSkillRoot(root: string, includeRootMarkdown: boolean, depth = 0): string[] {
  try {
    if (depth > 4 || !existsSync(root)) return [];
    const names: string[] = [];
    const skillFile = path.join(root, "SKILL.md");
    if (existsSync(skillFile)) return [readSkillName(skillFile) || path.basename(root)];

    for (const entry of readdirSync(root)) {
      if (entry.startsWith(".")) continue;
      const full = path.join(root, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        names.push(...scanSkillRoot(full, true, depth + 1));
      } else if (includeRootMarkdown && depth === 0 && entry.endsWith(".md")) {
        names.push(readSkillName(full) || path.parse(entry).name);
      }
    }
    return names;
  } catch {
    return [];
  }
}

function collectResourceCards(pi: ExtensionAPI, ctx: ExtensionContext): ResourceCard[] {
  const home = process.env.HOME || process.env.USERPROFILE || "";

  const skillCommandNames = pi
    .getCommands()
    .filter((command) => command.source === "skill")
    .map((command) => command.name.replace(/^skill:/, ""));
  const scannedSkillNames = home
    ? [
        ...scanSkillRoot(path.join(home, ".pi/agent/skills"), true),
        ...scanSkillRoot(path.join(home, ".agents/skills"), false),
      ]
    : [];
  const projectSkillNames = [
    ...scanSkillRoot(path.join(ctx.cwd, ".pi/skills"), true),
    ...scanSkillRoot(path.join(ctx.cwd, ".agents/skills"), false),
  ];
  const skills = uniqueSorted([...skillCommandNames, ...scannedSkillNames, ...projectSkillNames]);

  const extensionSourceNames = [
    ...pi
      .getCommands()
      .filter((command) => command.source === "extension")
      .map((command) => displayNameFromPath(command.sourceInfo.path)),
    ...pi
      .getAllTools()
      .filter((tool) => !["builtin", "sdk"].includes(tool.sourceInfo.source))
      .map((tool) => displayNameFromPath(tool.sourceInfo.path)),
  ];
  const scannedExtensionNames = home ? scanExtensionRoot(path.join(home, ".pi/agent/extensions")) : [];
  const projectExtensionNames = scanExtensionRoot(path.join(ctx.cwd, ".pi/extensions"));
  const extensions = uniqueSorted([...extensionSourceNames, ...scannedExtensionNames, ...projectExtensionNames]);

  const allThemes = ctx.ui.getAllThemes();
  const currentTheme = ctx.ui.theme.name;
  const themes = uniqueSorted(allThemes.map((theme) => theme.name));

  return [
    {
      title: "Skills",
      icon: "✧",
      count: skills.length,
      unit: "skill",
      items: skills,
      phase: 0.02,
    },
    {
      title: "Extensions",
      icon: "◈",
      count: extensions.length,
      unit: "extension",
      items: extensions,
      phase: 0.23,
    },
    {
      title: "Themes",
      icon: "◐",
      count: themes.length,
      unit: "theme",
      items: themes,
      note: currentTheme ? `active: ${currentTheme}` : undefined,
      phase: 0.44,
    },
  ];
}

function plural(count: number, unit: string): string {
  return count === 1 ? unit : `${unit}s`;
}

function cardBorder(width: number, left: string, fill: string, right: string, phase: number): string {
  return gradient(`${left}${fill.repeat(Math.max(0, width - 2))}${right}`, phase);
}

function renderCard(card: ResourceCard, width: number, theme: Theme): string[] {
  width = Math.max(20, width);
  const inner = Math.max(0, width - 2);
  const border = (text: string) => gradient(text, card.phase);
  const title = `${card.icon} ${theme.bold(card.title.toUpperCase())}`;
  const count = `${card.count} ${plural(card.count, card.unit)}`;
  const visibleItems = card.items.slice(0, MAX_CARD_ITEMS);
  const hiddenCount = Math.max(0, card.items.length - visibleItems.length);

  const line = (content: string): string => `${border("│")}${padAnsi(` ${content}`, inner, "…")}${border("│")}`;
  const titleLine = (() => {
    const titleText = theme.fg("accent", title);
    const countText = theme.fg("dim", count);
    const gap = Math.max(1, inner - 2 - visibleWidth(titleText) - visibleWidth(countText));
    return line(`${titleText}${" ".repeat(gap)}${countText}`);
  })();

  const itemLines = visibleItems.length > 0
    ? visibleItems.map((item) => line(`${theme.fg("dim", "•")} ${theme.fg("text", item)}`))
    : [line(theme.fg("dim", "• none found"))];

  if (hiddenCount > 0) {
    itemLines.push(line(theme.fg("muted", `+${hiddenCount} more`)));
  }

  if (card.note) {
    itemLines.push(line(`${DIM}${theme.fg("dim", card.note)}${RESET}`));
  }

  return [
    cardBorder(width, "╭", "─", "╮", card.phase),
    titleLine,
    cardBorder(width, "├", "─", "┤", card.phase + 0.04),
    ...itemLines,
    cardBorder(width, "╰", "─", "╯", card.phase + 0.08),
  ];
}

function combineCardRow(cardLines: string[][], width: number, gap = "  "): string[] {
  const height = Math.max(...cardLines.map((lines) => lines.length));
  const cardWidths = cardLines.map((lines) => visibleWidth(lines[0] || ""));
  const rowWidth = cardWidths.reduce((sum, cardWidth) => sum + cardWidth, 0) + gap.length * (cardLines.length - 1);
  const leftPad = " ".repeat(Math.max(0, Math.floor((width - rowWidth) / 2)));
  const output: string[] = [];

  for (let i = 0; i < height; i++) {
    output.push(
      leftPad +
        cardLines
          .map((lines, index) => padAnsi(lines[i] || "", cardWidths[index] || 0, ""))
          .join(gap),
    );
  }
  return output;
}

function renderCards(cards: ResourceCard[], width: number, theme: Theme): string[] {
  if (width <= 0) return [];
  const gapWidth = 2;

  if (width >= 92) {
    const cardWidth = Math.floor((width - gapWidth * 2) / 3);
    return combineCardRow(cards.map((card) => renderCard(card, cardWidth, theme)), width);
  }

  if (width >= 62) {
    const cardWidth = Math.floor((width - gapWidth) / 2);
    const firstRow = combineCardRow(cards.slice(0, 2).map((card) => renderCard(card, cardWidth, theme)), width);
    const secondRow = combineCardRow([renderCard(cards[2]!, cardWidth, theme)], width);
    return [...firstRow, "", ...secondRow];
  }

  return cards.flatMap((card, index) => {
    const lines = combineCardRow([renderCard(card, width, theme)], width);
    return index === cards.length - 1 ? lines : [...lines, ""];
  });
}

function clearBuiltInResourceListing(tui: MaybeContainer): void {
  // Private-but-stable TUI layout: [header, loadedResources, chat, ...].
  // Pi has no public API to suppress just the resource listing, so quietStartup
  // handles new sessions and this clears the already-rendered block on reload.
  const loadedResources = tui.children?.[1] as MaybeContainer | undefined;
  if (!loadedResources?.render || !loadedResources.clear) return;

  const text = loadedResources.render(140).join("\n");
  const hasBuiltInListing = ["[Context]", "[Skills]", "[Prompts]", "[Extensions]", "[Themes]"].some((marker) =>
    text.includes(marker),
  );
  if (!hasBuiltInListing) return;

  loadedResources.clear();
  tui.requestRender?.();
}

function renderHeader(options: {
  width: number;
  model: string;
  cwd: string;
  sessionName?: string;
  cards: ResourceCard[];
  theme: Theme;
}): string[] {
  const { width, model, cwd, sessionName, cards, theme } = options;
  if (width <= 0) return [];

  const title = `✦ pi // ${sessionName || projectName(cwd)}`;
  const subtitle = `${model} · ${shortenHome(cwd)}`;
  const titleLine = `${BOLD}${gradient(centerAnsi(title, width), 0.18)}${RESET}`;
  const logoLines = LOGO.map((line, row) => gradient(centerAnsi(line, width), row * 0.035));
  const subtitleLine = `${DIM}${gradient(centerAnsi(subtitle, width), 0.31)}${RESET}`;

  return [
    "",
    titleLine,
    "",
    ...logoLines,
    "",
    subtitleLine,
    "",
    ...renderCards(cards, width, theme),
    "",
  ].map((line) => fitLine(line, width));
}

export default function neonHeaderExtension(pi: ExtensionAPI): void {
  let requestRender: (() => void) | undefined;
  let model = "no model";
  let cwd = process.cwd();
  let sessionName: string | undefined;
  let cards: ResourceCard[] = [];
  let cleanupResourceSuppressors: Array<() => void> = [];

  function refreshCards(ctx: ExtensionContext): void {
    cards = collectResourceCards(pi, ctx);
  }

  function install(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;

    model = ctx.model?.id ?? "no model";
    cwd = ctx.cwd;
    sessionName = pi.getSessionName();
    refreshCards(ctx);
    cleanupResourceSuppressors.forEach((cleanup) => cleanup());
    cleanupResourceSuppressors = [];

    ctx.ui.setHeader((tui, theme) => {
      requestRender = () => tui.requestRender();

      for (const delay of [0, 25, 100, 250, 500]) {
        const timer = setTimeout(() => clearBuiltInResourceListing(tui as MaybeContainer), delay);
        cleanupResourceSuppressors.push(() => clearTimeout(timer));
      }

      return {
        render(width: number): string[] {
          return renderHeader({ width, model, cwd, sessionName, cards, theme });
        },
        invalidate(): void {
          tui.requestRender();
        },
      };
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    install(ctx);
  });

  pi.on("model_select", async (event) => {
    model = event.model.id;
    requestRender?.();
  });

  pi.on("session_info_changed", async (event) => {
    sessionName = event.name;
    requestRender?.();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    cleanupResourceSuppressors.forEach((cleanup) => cleanup());
    cleanupResourceSuppressors = [];
    requestRender = undefined;
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });

  pi.registerCommand("neon-header", {
    description: "Enable the neon pi dashboard header",
    handler: async (_args, ctx) => {
      install(ctx);
      ctx.ui.notify("Neon dashboard header enabled", "info");
    },
  });

  pi.registerCommand("refresh-header", {
    description: "Refresh the neon header resource cards",
    handler: async (_args, ctx) => {
      refreshCards(ctx);
      requestRender?.();
      ctx.ui.notify("Header cards refreshed", "info");
    },
  });

  pi.registerCommand("builtin-header", {
    description: "Restore pi's built-in header for this session",
    handler: async (_args, ctx) => {
      cleanupResourceSuppressors.forEach((cleanup) => cleanup());
      cleanupResourceSuppressors = [];
      requestRender = undefined;
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
