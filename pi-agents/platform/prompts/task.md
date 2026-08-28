---
description: Begin bounded work in an existing project
argument-hint: "<task>"
---

Work on this task in the current project:

${ARGUMENTS:-Use the task already described in this conversation.}

First inspect the relevant repository instructions, documentation, implementation, and current worktree state. Establish a compact working brief containing:

- the specific outcome
- constraints and behavior that must be preserved
- what will not be changed
- completion criteria
- the validation required

Ask only blocking questions. If the task is sufficiently clear, state any important assumptions and proceed with the smallest coherent implementation. Keep the session focused on this objective, preserve unrelated work, and validate the result before reporting completion.
