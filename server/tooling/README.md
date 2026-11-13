# `@sdm/tooling`

Shared configuration and the repository's scripts.

What goes in it:

- `tsconfig.base.json`: the TypeScript config every package extends.
- A setup check: Node and pnpm versions, dependencies, line endings, file names, free ports, each failure with how to fix it.
- Workflow checks used by CI and before opening a PR: branch name and base, folder ownership, commit message format, no secrets or build output committed, determinism of simulation code.

Scripts are TypeScript or plain Node.js, never bash, so they run on macOS, Windows and Linux. Start with `tsconfig.base.json` and add checks when the team needs them, each in its own `platform` issue.
