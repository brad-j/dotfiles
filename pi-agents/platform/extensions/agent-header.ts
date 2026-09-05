import { CustomEditor, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

const GLYPHS: Record<string, readonly string[]> = {
    A: [" ██ ", "█  █", "████", "█  █", "█  █"],
    C: ["████", "█   ", "█   ", "█   ", "████"],
    D: ["███ ", "█  █", "█  █", "█  █", "███ "],
    E: ["████", "█   ", "███ ", "█   ", "████"],
    G: ["████", "█   ", "█ ██", "█  █", "████"],
    I: ["████", " ██ ", " ██ ", " ██ ", "████"],
    M: ["█   █", "██ ██", "█ █ █", "█   █", "█   █"],
    N: ["█  █", "██ █", "█ ██", "█  █", "█  █"],
    O: ["████", "█  █", "█  █", "█  █", "████"],
    P: ["████", "█  █", "████", "█   ", "█   "],
    R: ["████", "█  █", "████", "█ █ ", "█  █"],
    T: ["█████", "  █  ", "  █  ", "  █  ", "  █  "],
    V: ["█  █", "█  █", "█  █", "█  █", " ██ "],
    W: ["█   █", "█   █", "█ █ █", "██ ██", "█   █"],
    X: ["█  █", "█  █", " ██ ", "█  █", "█  █"],
    Y: ["█  █", "█  █", " ██ ", " ██ ", " ██ "],
};

type HeaderColor = "accent" | "success" | "warning";

export type AgentProfile = {
    title: string;
    subtitle: string;
    color: HeaderColor;
};

const PROFILES: Record<string, AgentProfile> = {
    code: {
        title: "CODE",
        subtitle: "GENERAL SOFTWARE DEVELOPMENT",
        color: "accent",
    },
    everyday: {
        title: "EVERYDAY",
        subtitle: "RESEARCH · COMPARISONS · PLANNING",
        color: "accent",
    },
    print: {
        title: "PRINT",
        subtitle: "CAD · SLICING · PRINTABILITY",
        color: "success",
    },
    proxmox: {
        title: "PROXMOX",
        subtitle: "GUARDED HOMELAB OPERATIONS",
        color: "warning",
    },
    writing: {
        title: "WRITING",
        subtitle: "ORGANIZATION · RESEARCH · CONTINUITY",
        color: "accent",
    },
};

function renderBanner(title: string): string[] {
    return Array.from({ length: 5 }, (_, row) =>
        [...title].map((letter) => GLYPHS[letter]?.[row] ?? letter).join("  ").trimEnd(),
    );
}

export function getActiveAgentProfile(): AgentProfile | undefined {
    const profileName = process.env.PI_AGENT_PROFILE;
    return profileName ? PROFILES[profileName] : undefined;
}

function buildHeader(profile: AgentProfile, theme: Theme, width: number): string[] {
    const banner = renderBanner(profile.title);
    const bannerWidth = Math.max(...banner.map(visibleWidth));
    const subtitle = theme.fg("muted", profile.subtitle);

    if (bannerWidth > width) {
        return [
            "",
            theme.bold(theme.fg(profile.color, `◆ ${profile.title}`)),
            subtitle,
            "",
        ];
    }

    return [
        "",
        ...banner.map((line) => theme.bold(theme.fg(profile.color, line))),
        "",
        subtitle,
        "",
    ];
}

/** Replaces Pi's startup header with the active purpose-built agent's name. */
export default function registerAgentHeader(pi: ExtensionAPI): void {
    pi.on("session_start", (_event, ctx) => {
        if (ctx.mode !== "tui") return;

        const profile = getActiveAgentProfile();
        if (!profile) return;

        ctx.ui.setTitle(`${profile.title} · Pi`);
        ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
            const editor = new CustomEditor(tui, editorTheme, keybindings);
            editor.borderColor = (text) => ctx.ui.theme.fg(profile.color, text);
            return editor;
        });
        ctx.ui.setHeader((_tui, theme) => ({
            invalidate() { },
            render(width: number): string[] {
                return buildHeader(profile, theme, width);
            },
        }));
    });
}
