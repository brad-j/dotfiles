import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

const GLYPHS: Record<string, readonly string[]> = {
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
    X: ["█  █", "█  █", " ██ ", "█  █", "█  █"],
};

type HeaderColor = "accent" | "success" | "warning";

type Profile = {
    title: string;
    subtitle: string;
    color: HeaderColor;
};

const PROFILES: Record<string, Profile> = {
    code: {
        title: "CODE",
        subtitle: "GENERAL SOFTWARE DEVELOPMENT",
        color: "accent",
    },
    printing: {
        title: "PRINTING",
        subtitle: "CAD · SLICING · PRINTABILITY",
        color: "success",
    },
    proxmox: {
        title: "PROXMOX",
        subtitle: "GUARDED HOMELAB OPERATIONS",
        color: "warning",
    },
};

function renderBanner(title: string): string[] {
    return Array.from({ length: 5 }, (_, row) =>
        [...title].map((letter) => GLYPHS[letter]?.[row] ?? letter).join("  ").trimEnd(),
    );
}

function buildHeader(profile: Profile, theme: Theme, width: number): string[] {
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

        const profileName = process.env.PI_AGENT_PROFILE;
        const profile = profileName ? PROFILES[profileName] : undefined;
        if (!profile) return;

        ctx.ui.setTitle(`${profile.title} · Pi`);
        ctx.ui.setHeader((_tui, theme) => ({
            invalidate() { },
            render(width: number): string[] {
                return buildHeader(profile, theme, width);
            },
        }));
    });
}
