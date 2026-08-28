---
description: Define and begin a new project
argument-hint: "<project idea>"
---

Help me start a new project.

Project idea: ${ARGUMENTS:-Use the project idea already described in this conversation.}

Before implementing:

1. Inspect the current directory and any relevant existing files. Do not overwrite or repurpose an existing project.
2. Turn the idea into a concise project brief covering:
   - the intended outcome and target user
   - the first useful milestone
   - requirements, constraints, and non-goals
   - important assumptions or decisions
   - completion criteria and validation
3. Ask only questions whose answers would materially change the first milestone. Otherwise, state sensible assumptions.
4. Recommend an appropriate initial approach without adding unnecessary infrastructure or process.

Present the brief and wait for my agreement before creating the project or implementing it.
