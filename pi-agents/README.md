# Purpose-built Pi agents

These packages define five independent agents built on Pi:

- `code` — general software development
- `everyday` — personal research, comparisons, planning, and drafting
- `print` — CAD, slicing, printability, and 3D-printing workflows
- `proxmox` — guarded Proxmox and homelab operations
- `writing` — non-creative fiction organization, research, continuity, and administration

Each agent has its own `PI_CODING_AGENT_DIR`, instructions, settings, sessions, and domain resources. The `platform` Pi package provides common UI, handoff behavior, and model-facing secret-path protection without making the agents share mutable runtime state. Its protected-path gate blocks model-initiated file tools and shell commands from accessing agent authentication, Cloak configuration, environment and credential files, and private key material. Its startup header renders the active agent name in ASCII art, with a compact fallback for narrow terminals.

## Commands

```bash
pi-agent --list
pi-agent doctor
pi-agent code
pi-agent everyday
pi-agent print
pi-agent proxmox
pi-agent writing
```

Compatibility commands `pi-code`, `pi-everyday`, `pi-print`, `pi-proxmox`, and `pi-writing` delegate to `pi-agent`. The writing agent starts in `~/omega/Writing`, where it can work across project directories and `ideas/`; set `PI_WRITING_CWD` to override that root for one invocation.

## Proxmox command approval

The Proxmox gate checks model-initiated `bash` calls for SSH, SCP, and SFTP invocations. Only direct `ssh` or `/usr/bin/ssh` commands to the known nodes, with explicitly allowed inspection arguments, skip approval. Unknown options, wrappers, compound commands, alternate targets, and mutations require approval for that exact call; there is no session-wide bypass. Non-interactive runs block those calls. Commands mentioning recognized sensitive paths remain blocked without an approval option.

This is best-effort protection against accidental operations, not a sandbox. Scripts, computed executable names, alternate clients, and user-entered `!` commands are not comprehensively intercepted. Use OS-level isolation or a restricted remote account when hard enforcement is required.

## Resource ownership

- `platform/`: shared extensions, skills, and workflow prompt templates
- `print/`: print-agent skills and future tools
- `proxmox/`: Proxmox-only extensions and skills
- `writing/`: writing-agent boundary enforcement
- `agents.json`: launch registry and expected package composition
- `~/.pi/agent` and `~/.pi/agents/*`: private runtime roots

Secrets, sessions, caches, installed npm packages, and generated model stores remain outside this repository.

## Adding an agent

1. Add an entry to `agents.json`.
2. Create a Pi package for its domain extensions, skills, prompts, or themes.
3. Create its runtime root with `AGENTS.md` and `settings.json`.
4. Add the platform and domain package paths to that settings file.
5. Run `pi-agent doctor <name>`.
