# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

Before generating or modifying any code, read both rule files:
1. `.agent/rules/architecture.md` — monorepo architecture rules and development workflow
2. `.agent/rules/cloude.md` — agent behavior: planning, verification, task management, communication

These rules are `trigger: always_on` and must not be ignored.

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

The backend forwards images as base64 JSON to the Python AI server, enforces per-user monthly quotas (stored in `usage_quotas` with composite PK `user_id + month`), and records usage only on successful inference.

### Auth

Session-based: login sets an HTTP-only cookie (`SameSite=None; Secure` for cross-origin HTTPS, `SameSite=Lax` for local HTTP). Sessions expire after 7 days. Each protected endpoint calls `getSessionUser()`.

### Deployment targets

- **Backend:** Cloudflare Workers (via Wrangler), database is Cloudflare D1
- **Frontend:** Static assets (Cloudflare Pages, Vercel, etc.)
- **AI Server:** Docker, requires `API_KEY` env var for auth
