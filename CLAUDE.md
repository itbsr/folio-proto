# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (always from root)
npm install

# Development servers
npm run dev:backend    # Hono backend on http://localhost:8787 (Wrangler)
npm run dev:frontend   # Vite frontend dev server

# Build & type check
npm run build          # Build all workspaces
npm run typecheck      # TypeScript type check (no emit)

# Backend only
npm run deploy --workspace=@my-app/backend   # Deploy to Cloudflare Workers

# AI inference server (Docker)
make build    # Build Docker image with model weights
make run      # Start container on port 8000
make deploy   # Stop + rebuild + run
make logs     # Tail container logs
```

**Never run `npm install` inside a package subdirectory.** All dependency management goes through the root workspace.

## Environment Variables

### Backend (Wrangler secrets — set per environment)

```bash
wrangler secret put AI_ENDPOINT   # URL of the FastAPI AI server, e.g. http://localhost:8000
wrangler secret put AI_API_KEY    # Bearer token for AI server auth
```

Both must be set for staging/production. The AI server validates `Authorization: Bearer <AI_API_KEY>` on every request.

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend origin in production (e.g. `https://api.example.com`). Omit in dev — Vite proxies `/api` to `http://localhost:8787`. |

## Architecture

This is an `npm workspaces` monorepo with three TypeScript packages plus a Python AI server:

```
packages/shared/     → Zod schemas + inferred types (no framework deps)
packages/backend/    → Hono API on Cloudflare Workers + D1 SQLite
packages/frontend/   → React + Vite SPA
ai-server/           → FastAPI + DewarpNet model (Docker)
```

### Package responsibilities

**`packages/shared/`** is the single source of truth. All data shapes start here as Zod schemas in `src/schemas/`, types are extracted via `z.infer<>` in `src/types/`, and everything is re-exported from `src/index.ts`. No React, Hono, or other framework imports belong here.

**`packages/backend/`** consumes shared schemas via `@hono/zod-validator`, exports its router type as `AppType`, and manages the D1 database. All schema changes require a new SQL migration in `migrations/`.

**`packages/frontend/`** communicates with the backend exclusively via the Hono RPC client defined in `src/lib/hc.ts` — never raw `fetch` or axios. Form validation uses shared Zod schemas directly (no duplicate type definitions).

### TypeScript path aliases

```
@my-app/shared   → packages/shared/src/index.ts
@my-app/backend  → packages/backend/src/index.ts  (imported by frontend for AppType only)
```

### Mandatory development order for new features

1. Define/update Zod schema in `shared/src/schemas/` and re-export from `shared/src/index.ts`
2. Write D1 migration SQL in `backend/migrations/` (if schema changes)
3. Implement backend endpoint, validate with shared schema, export `AppType`
4. Build frontend component using the Hono RPC client

### Image processing pipeline

The backend offers three endpoints for image dewarping:
- `POST /api/images/process` — simple request/response (blocks until done)
- `POST /api/images/process-stream` — SSE stream with progress stages: `received → infer → done`
- `POST /api/images/upload` + `GET /api/images/progress` — separate upload (XHR byte-progress) + SSE progress stream; the most complete option, tracking 4 phases

The backend forwards images as base64 JSON to the Python AI server, enforces per-user monthly quotas (stored in `usage_quotas` with composite PK `user_id + month`), and records usage only on successful inference. Usage is recorded before streaming the result back — a cancelled download still consumes quota.

### Auth

Session-based: login sets an HTTP-only cookie (`SameSite=None; Secure` for cross-origin HTTPS, `SameSite=Lax` for local HTTP). Sessions expire after 7 days. Each protected endpoint calls `getSessionUser()`. Passwords are hashed with PBKDF2-SHA256 (100k iterations) via the Web Crypto API — not bcrypt.

The Hono RPC client (`src/lib/hc.ts`) must be initialized with `credentials: 'include'` so the browser sends the session cookie on cross-origin requests in production.

### Quota limits

- `free` plan: 50 requests/month
- `pro` plan: 1000 requests/month

Month is tracked as a `YYYY-MM` string (UTC). Rows in `usage_quotas` are created on first use each month; no manual reset is needed.

### HEIC image handling

MIME type for HEIC files is unreliable on Windows and some drag-and-drop scenarios. `src/lib/imageFile.ts` detects HEIC by both `file.type` and filename extension, then converts client-side to JPEG (quality 0.92) via `heic2any` before upload.

### AI server constraints

The FastAPI server (`ai-server/`) holds job state (queues, buffers, progress) in process memory keyed by `jobId`. Jobs expire after 5 minutes if unclaimed. This means **the AI server cannot be horizontally scaled** without adding external state (Redis, Durable Objects, etc.).

### Deployment targets

- **Backend:** Cloudflare Workers (via Wrangler), database is Cloudflare D1
- **Frontend:** Static assets (Cloudflare Pages, Vercel, etc.)
- **AI Server:** Docker, requires `API_KEY` env var for auth

## Anti-Patterns

- Duplicate type/interface definitions across packages — all types come from `shared/`
- `backend/` importing from `frontend/`
- `shared/` importing `react`, `hono`, or any framework package
- Raw `fetch` or `axios` in frontend — use the Hono RPC client (`hc`) only
- Running `npm install` inside a package subdirectory

## Agent Behavior

### Planning

- For tasks with 3+ steps, multiple file changes, or architectural decisions, define a todo list with the built-in task tool before starting.
- Include verification steps (lint/typecheck/build/manual check) in the todo list from the start.
- If requirements are ambiguous, write out explicit input/output/edge-case specs first.

### Task management

- Keep exactly one item "in progress" at a time.
- Give each item clear acceptance criteria; report what changed, where, and how it was verified to the user when done (see Definition of Done) rather than in a committed file.
- After fixes or postmortems, append a new entry to `tasks/lessons.md`: failure mode, detection signal, prevention rule.
- Review `tasks/lessons.md` at session start and before large refactors.

### Definition of Done

A task is complete only when:
1. Behavior matches acceptance criteria.
2. Relevant tests/lint/typecheck/build pass (or skipped with documented reason).
3. A short verification story exists: what changed and how it was confirmed.
4. README.md is updated if the change affects it (see Documentation).
5. If the change addresses a GitHub issue: the issue is linked from the PR per the Pull requests rules, and confirmed closed after merge.

### Pull requests

- A PR that addresses a GitHub issue must state `Closes #<number>` on its own line in the **PR body**. GitHub only recognizes the exact keywords close/closes/closed/fix/fixes/fixed/resolve/resolves/resolved — phrases like "closing #24" or "(issue #24)" do not link the issue and auto-close silently fails. Commit messages may mention the issue number for context, but never rely on them to close the issue.
- After opening the PR and **before merging**, verify the link exists: the issue appears in the PR's "Development" sidebar, or `gh pr view <PR> --json closingIssuesReferences` returns a non-empty list. If it is empty, fix the PR body first.
- After merging, confirm the issue was actually closed (`gh issue view <number> --json state`).

### Documentation

When a change alters anything documented in README.md, update README.md in the same branch/PR. This includes:

- Commands, setup, or startup steps (`package.json` scripts, `Makefile` targets)
- API endpoints (paths, methods, behavior)
- Environment variables or secrets
- Architecture, tech stack, or dependencies with user-facing impact
- Quota limits, deployment steps, or known constraints

Purely internal refactors that don't change any documented behavior do not require a README update.

### Error recovery

When an unexpected failure occurs (test failure, build error, regression): stop adding features, save the evidence, and return to diagnose + replan.

Triage order: reproduce → localize (which layer: UI/API/DB/build) → reduce to minimal case → fix root cause → add regression coverage → verify end-to-end.

### Communication

- Report results and impact, not process narration.
- Ask at most one focused question when blocked; include a recommended default and explain what the answer changes.
- Always state what was run (test/lint/build) and what the outcome was.
