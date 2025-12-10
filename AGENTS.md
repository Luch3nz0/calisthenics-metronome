# Agent Guidelines

- Always run `npm run typecheck` (tsc --noEmit) and any lint scripts before delivering changes; failures are blockers.
- Build output with `npm run build` so `dist/app.js` stays in sync with `app.ts`.
- If tooling is missing (Node/npm/nvm), pause and request installation/permission before proceeding.
- Keep the codebase strictly typed; do not introduce `any` or weaken TS/lint rules to pass checks.
