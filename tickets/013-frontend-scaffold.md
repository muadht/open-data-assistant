# 013 — Scaffold the frontend

## Context

Nothing exists in `frontend/` yet. Per [TECH_STACK.md](../TECH_STACK.md): Vite + React + TypeScript, not Next.js (we don't need SSR/API routes — FastAPI is the backend), with shadcn/ui and prompt-kit added on top.

## Acceptance criteria

- [ ] `frontend/` scaffolded with Vite + React + TypeScript, npm as the package manager.
- [ ] shadcn/ui initialized (Tailwind CSS configured, component source copied in per its normal setup, not installed as an opaque dependency).
- [ ] prompt-kit's components added the same way (copy-the-source model) — confirm during setup that its CLI/docs target a plain Vite setup cleanly, since its examples may default to Next.js; note any friction found here, since this is exactly the kind of assumption-check this project has been doing throughout.
- [ ] Basic app shell: a layout with a chat panel and space for charts/export controls, no real functionality yet — this ticket is scaffolding, not features.
- [ ] `npm run build` and a lint/format command (whatever shadcn/prompt-kit's conventions use, e.g. ESLint/Prettier) both run clean.
- [ ] A short section added to `README.md` for how to run the frontend locally (`cd frontend && npm install && npm run dev`).

## References

- [TECH_STACK.md](../TECH_STACK.md) — Frontend section
- [docs/architecture-overview.md](../docs/architecture-overview.md) — component diagram
