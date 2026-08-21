# Purpose-built Pi agents

These packages define three independent agents built on Pi:

- `code` — general software development
- `printing` — CAD, slicing, printability, and 3D-printing workflows
- `proxmox` — guarded Proxmox and homelab operations

Each agent has its own `PI_CODING_AGENT_DIR`, instructions, settings, sessions, and domain resources. The `platform` Pi package provides common UI and handoff behavior without making the agents share mutable runtime state. Its startup header renders the active agent name in ASCII art, with a compact fallback for narrow terminals.

## Commands

```bash
pi-agent --list
pi-agent doctor
pi-agent code
pi-agent printing
pi-agent proxmox
```

Compatibility commands `pi-code`, `pi-print`, and `pi-proxmox` delegate to `pi-agent`.

## Resource ownership

- `platform/`: shared extensions and skills
- `printing/`: printing-only skills and future tools
- `proxmox/`: Proxmox-only extensions and skills
- `agents.json`: launch registry and expected package composition
- `~/.pi/agent` and `~/.pi/agents/*`: private runtime roots

Secrets, sessions, caches, installed npm packages, and generated model stores remain outside this repository.

## Adding an agent

1. Add an entry to `agents.json`.
2. Create a Pi package for its domain extensions, skills, prompts, or themes.
3. Create its runtime root with `AGENTS.md` and `settings.json`.
4. Add the platform and domain package paths to that settings file.
5. Run `pi-agent doctor <name>`.
