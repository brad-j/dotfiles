# Global Working Guidelines

## Workflow

- Inspect relevant files and existing conventions before editing.
- Make the smallest coherent change that fully addresses the request.
- Preserve existing architecture and style unless a change is justified.
- Prefer focused searches and targeted reads over scanning unrelated files.
- Do not modify generated, vendored, or runtime-state files unless requested.
- Preserve unrelated user changes.

## Package Management

- Prefer `pnpm` for JavaScript and TypeScript projects.
- Use `pnpm add` and `pnpm remove` rather than manually editing dependency versions.
- Use `pnpm exec` instead of `npx`.
- Respect an existing project's package manager and lockfile when it differs.
- Do not generate or commit a different package manager's lockfile.
- Ask before adding major dependencies.

## Validation

- Run the most relevant available checks after making changes.
- Prefer focused tests first, followed by broader checks when appropriate.
- Use the scripts and tooling already defined by the project.
- Report which checks were run and identify any that could not be run.
- Do not claim a change works when validation failed or was not performed.

## Safety

- Never expose secrets, credentials, tokens, or private identifiers.
- Do not run destructive Git or filesystem operations without explicit approval.
- Do not discard, overwrite, or revert unrelated user changes.
- Ask before changing public APIs, schemas, deployment configuration, or persistent data.

## Communication

- Be concise and direct.
- Explain important assumptions and tradeoffs.
- Mention changed file paths in the final response.
- Call out unresolved risks, failed checks, and follow-up work clearly.
