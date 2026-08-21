---
name: homelab-proxmox
description: Operate Brad's two standalone Proxmox VE nodes, think-1 and think-2, over SSH and keep the homelab repository aligned with observed state. Use for Proxmox inventory, diagnosis, guest operations, storage, networking, backups, upgrades, and recovery.
---

# Homelab Proxmox

## Environment

- `think-1` and `think-2` are separate standalone Proxmox VE nodes, not cluster members.
- Connect with the existing SSH aliases `think-1` and `think-2`. They use root with the dedicated `~/.ssh/proxmox/id_ed25519` key.
- The authoritative inventory is `/Users/brad/omega/Code/homelab/infrastructure/hosts.yaml`.
- Operator documentation belongs in `/Users/brad/omega/Code/homelab/docs/`.
- `https://think-1.half.black` and `https://think-2.half.black` are Caddy-proxied web interfaces. Caddy is not the SSH transport.
- Both nodes were observed on Proxmox VE 9.2.4 on 2026-08-19. Re-check rather than treating this as permanent.

## Connection Rules

- Use `ssh think-1 '…'` or `ssh think-2 '…'`; do not repeat addresses, usernames, or key paths in routine commands.
- Use `BatchMode=yes` for unattended checks when failure must be immediate.
- Never read, print, copy, or transmit the private key.
- Do not expose SSH configuration, API tokens, storage credentials, private certificates, or `/etc/pve/priv/` content.
- Keep commands on one line where practical.

## Read-First Workflow

1. Identify the exact target node and guest, storage, network, or service.
2. Inspect the narrowest relevant state with supported Proxmox commands or APIs.
3. State observed facts separately from assumptions.
4. For a mutation, explain impact, interruption, dependencies, rollback, and validation.
5. Obtain explicit approval naming the target and action.
6. Execute the smallest change and validate it.
7. Update the homelab inventory or operator documentation when the durable state changed.

When the target node is ambiguous, inspect both nodes or ask; never guess from a VM ID alone.

## Inspection Guidance

Common genuinely read-oriented commands include:

```sh
ssh think-1 'pveversion --verbose'
ssh think-1 'qm list'
ssh think-1 'qm status <vmid>'
ssh think-1 'qm config <vmid>'
ssh think-1 'pct list'
ssh think-1 'pvesh get /nodes/think-1/status --output-format json'
ssh think-1 'journalctl -u <unit> --since "1 hour ago" --no-pager'
```

Even nominal status commands can have side effects. In this environment, `pvesm status` attempted to activate an unavailable NFS storage. Explain that possibility and obtain approval before commands that may activate, mount, probe, lock, migrate, replicate, snapshot, back up, start, stop, or reload anything.

Prefer structured output from `pvesh` when available. Bound journal and task-log reads by time or line count. Never dump broad configuration trees when a narrow endpoint answers the question.

## Mutation Rules

Explicit approval is required before:

- Starting, stopping, rebooting, resetting, suspending, resuming, migrating, cloning, or deleting a guest.
- Creating, resizing, moving, attaching, detaching, snapshotting, rolling back, or deleting storage or disks.
- Running backups or restores when they can affect load, locks, retention, or existing data.
- Changing bridges, bonds, VLANs, routes, DNS, firewall rules, certificates, users, roles, authentication, repositories, packages, kernel settings, or boot configuration.
- Editing anything under `/etc/pve`, changing services, or rebooting a node.

Approval for diagnosis is not approval for repair. Approval for one node or guest does not cover the other.

Use supported `qm`, `pct`, `pvesh`, `pvesm`, `vzdump`, and package-management interfaces instead of directly editing generated state. Before risky work, verify the recovery method exists and is usable. A snapshot is not a backup.

## Documentation

Treat live state as authoritative for current operation and the repository as authoritative for intended inventory and operating notes. If they differ, report the drift before changing either. Never put passwords, tokens, private keys, storage secrets, or unredacted private configuration into the repository.
