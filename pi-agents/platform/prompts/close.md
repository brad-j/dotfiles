---
description: Verify and formally finish the current task
argument-hint: "[additional acceptance criteria]"
---

Close the current task. ${ARGUMENTS:-Use the objective and acceptance criteria established in this conversation.}

Before declaring it complete:

1. Re-read the objective, constraints, and completion criteria.
2. Inspect the relevant changes and current worktree without disturbing unrelated work.
3. Check for incomplete implementation, regressions, temporary artifacts, and unnecessary changes.
4. Run the most relevant available validation and verify user-facing behavior where practical.
5. Complete minor closure work and revalidate it. If completion would require broader scope, a consequential decision, or unsafe action, stop and explain rather than expanding the task.
6. Preserve durable decisions or documentation when they are clearly warranted.

Do not start another milestone. Finish with a concise statement of:

- whether the task is complete
- what changed
- validation performed and its result
- one concrete thing I can verify myself
- unresolved risks or follow-up work
