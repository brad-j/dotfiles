---
name: handoff
description: Write a durable handoff document so work can continue with a cleaner context. Invoke only through the /handoff command.
disable-model-invocation: true
---

# Handoff

Write a concise but complete handoff document to the exact absolute path supplied by the user. Create its parent directory if necessary. Do not choose a different path.

Include:

- The original goal and current phase.
- User constraints and preferences.
- Work completed, including files changed and validation run.
- Work currently in progress.
- Unresolved issues, blockers, and risks.
- Important decisions and their rationale.
- The exact next unfinished step.
- References to relevant plans, specifications, issues, commits, diffs, and files.
- A short `Suggested skills` section for the continuing agent.

Do not duplicate large content already captured in another artifact; reference its path or URL instead. Treat the current worktree as authoritative for file state. Redact credentials, tokens, private identifiers, personal information, and other sensitive values.

After writing the document, set its permissions to `0600`. Respond with its exact absolute path and a one-sentence summary. Do not continue the underlying implementation task during this turn.
