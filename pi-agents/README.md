# Purpose-built Pi agents

These packages define five independent agents built on Pi:

- `code` — general software development
- `everyday` — personal research, comparisons, planning, and drafting
- `print` — CAD, slicing, printability, and 3D-printing workflows
- `proxmox` — guarded Proxmox and homelab operations
- `writing` — non-creative fiction organization, research, continuity, and administration

Each agent has its own `PI_CODING_AGENT_DIR`, instructions, settings, sessions, and domain resources. The `platform` Pi package provides common UI, handoff behavior, and model-facing secret-path protection without making the agents share mutable runtime state. Its protected-path gate checks known file tools and literal shell references for recognized authentication, Cloak configuration, environment/credential files, and private key paths. Its startup header renders the active agent name in ASCII art, with a compact fallback for narrow terminals.

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

## Development checks

Run `pnpm check` from `pi-agents/` for tests, strict TypeScript checking, registry validation, and agent doctor checks. Development Pi packages are pinned to `0.85.1`, matching the installed runtime when aligned; future runtime upgrades require a separate dependency review.

The compiler also includes `../pi/.pi/agent/extensions/**/*.ts` (Caveman and vision-sidecar). Its `paths` mappings resolve their SDK imports through this project's development dependencies, mirroring Pi's runtime module aliases without moving extensions or adding runtime installations. Regression tests verify compiler coverage and load both extensions through the real SDK using empty project/runtime roots, without starting an agent session or calling providers.

The six release-age exceptions in `pnpm-workspace.yaml` were explicitly approved for exact `0.85.1` package versions; they do not exempt future releases. Existing build-script restrictions remain unchanged. Vision-sidecar's broader behavior cleanup remains separate from these typecheck fixes.

## Compaction checkpoints

The shared `platform/extensions/continue-after-compaction.ts` now provides notices only; it never injects a continuation message. After successful compaction without a retry, UI sessions receive a reminder to review completed work at the next stopping point and choose whether to stop or continue. `/close` and `/handoff` are suggested only when those commands are available. Notices are suppressed during `/handoff`, automatic retries, and non-UI runs.

Automatic compaction stays enabled. Pi still owns overflow recovery, continuation within active runs, and delivery of queued messages. This extension does not force those runs to pause or cancel user requests. Manual `/compact` on an idle session no longer starts an extra model turn through this extension.

## Writing resource filters

Writing excludes the shared `/handoff` command, its context reminder, and `/skill:handoff`. That workflow asks the model to write outside the writing workspace and set file permissions using shell access; writing permits neither. The other four agents retain the workflow. No writing permission exceptions are added.

Keep this platform package entry in `~/.pi/agents/writing/settings.json` (adjust `source` to the checkout location):

```json
{
  "source": "~/dotfiles/pi-agents/platform",
  "extensions": ["-extensions/handoff/index.ts"],
  "skills": ["-skills/handoff/SKILL.md"],
  "prompts": []
}
```

The exact-path exclusions preserve other shared extensions and skills. The existing empty `prompts` filter continues to exclude coding-oriented workflow templates. These filters apply to this package entry, not separately installed copies or project overrides. Reload or restart writing after changing them; `/handoff` and `/skill:handoff` should no longer appear in command completion.

## Secret-path protection

The platform gate checks model calls to `read`, `write`, `edit`, `grep`, `see`, and the target roots of `find`/`ls`. It checks literal and normalized paths, including symlink destinations, leading `@`, file URLs, and Pi's Unicode-space normalization. `bash` and `powershell` retain best-effort literal secret-path checks; PowerShell backslash separators are recognized too.

Directory `grep` gets a metadata-only preflight, including hidden entries and symlinked directories. It blocks the entire search if it finds a protected path, cannot inspect an entry, is cancelled, or exceeds 10,000 entries or 64 directory levels. Globs and `.gitignore` do not exempt a directory from this check. Use an explicit safe file or a narrower clean directory when a mixed workspace is blocked. No secret contents are read by the preflight.

These are accidental-exposure guards, not a sandbox or universal redaction. Directory listings and filename searches can still reveal names under ordinary roots. Files can change after preflight; hard links, unrecognized secret names, arbitrary scripts, computed shell paths, user-entered `!` commands, and internal I/O in other extensions remain outside reliable coverage. Cloak redacts configured text patterns from `read` results only; it does not close these gaps. Use OS-level isolation for hard enforcement.

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
