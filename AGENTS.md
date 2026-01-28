# Agent Guidelines

- Always run `npm run typecheck` (tsc --noEmit) and any lint scripts before delivering changes; failures are blockers.
- Build output with `npm run build` so `dist/app.js` stays in sync with `app.ts`.
- Keep the codebase strictly typed; do not introduce `any` or weaken TS/lint rules to pass checks.
