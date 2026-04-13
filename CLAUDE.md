# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

waoowaoo is an AI-powered video generation platform that converts novels/stories into videos. Built with Next.js 15 (App Router) + React 19, BullMQ task queues, Prisma + MySQL, and multiple AI provider integrations (OpenAI, Google Gemini, Ark, Fal.ai, Vidu, Kling).

## Common Commands

```bash
# Development (starts Next.js + workers + watchdog + Bull Board)
npm run dev

# Individual dev processes
npm run dev:next          # Next.js with Turbopack on 0.0.0.0
npm run dev:worker        # BullMQ worker process
npm run dev:watchdog      # Task heartbeat monitor
npm run dev:board         # Bull Board admin panel (localhost:3010)

# Build
npm run build             # prisma generate + next build

# Database
npx prisma db push        # Apply schema changes
npx prisma studio         # Database admin UI

# Linting & Type Checking
npm run lint              # ESLint (current directory)
npm run lint:all          # ESLint (entire project)
npm run typecheck         # tsc --noEmit

# Testing
npm run test:unit:all                 # All unit tests
npm run test:all                      # Full test suite (guards + unit + integration + system + regression)
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/path/to/file.test.ts  # Single test file

# Pre-commit verification
npm run verify:commit     # lint + typecheck + test:all
```

## Architecture

### Task Queue System (Core Pattern)

The central architecture is an async task queue built on BullMQ + Redis:
- **Task submission**: API routes create tasks in MySQL via Prisma, then enqueue jobs to Redis via `src/lib/task/submitter.ts`
- **Queue definitions**: `src/lib/task/queues.ts` — four queues: image, video, voice, text
- **Workers**: `src/lib/workers/` — handlers in `handlers/` subdirectory, dispatched by task type
- **Progress**: Real-time updates via SSE (`src/app/api/sse/`)
- **Startup recovery**: `src/instrumentation.ts` resets stalled processing tasks and replays orphaned jobs

### LLM Abstraction Layer

All LLM calls go through `src/lib/llm/` — never call providers directly from API routes:
- `chat-completion.ts` — unified chat API
- `chat-stream.ts` — streaming responses
- `vision.ts` — image understanding
- Provider implementations in `src/lib/llm/providers/`

### Storage Abstraction

`src/lib/storage/` provides a provider-agnostic file storage layer:
- `factory.ts` selects provider (MinIO, S3, Tencent COS, local)
- `signed-urls.ts` generates pre-signed URLs

### Internationalization

- Locale-based routing via `[locale]` segment (zh, en; default: zh)
- Translations in `/messages/[locale]/*.json`
- Uses next-intl with middleware at `src/middleware.ts`

### Billing System

- Task-based cost tracking in `src/lib/billing/`
- Three modes: OFF, SHADOW (track only), ENFORCE
- Coverage threshold: 80% on billing code

### Media Pipeline

- `src/lib/media/outbound-image.ts` — image normalization/optimization
- `src/lib/generators/` — AI content generators (Ark, Vidu, Fal.ai, etc.)
- Remotion for client-side video composition

## Key Conventions

- **Path alias**: `@/*` maps to `src/*`
- **Icons**: Import from `@/components/ui/icons` only — direct `lucide-react` imports are lint errors
- **No inline SVG**: Use `AppIcon` or the icons module
- **API routes**: Use `requireUserAuth()` and `apiHandler()` wrappers
- **Logging**: Use structured logging from `src/lib/logging/core.ts` — no `console.log`
- **Tests**: Vitest with `pool: 'forks'` (single fork), 30s timeout. Set `BILLING_TEST_BOOTSTRAP=0` for unit tests, `=1` for integration/billing tests

## Infrastructure (Docker Compose)

- MySQL 8.0 (port 13306), Redis (port 16379), MinIO (port 19000)
- App runs on port 13000 in Docker, 3000 in dev
- Bull Board admin on port 3010

## Pre-commit Guards

Husky runs `verify:commit` which includes architectural guards in `scripts/guards/`:
- API route contract validation
- No direct LLM calls from API routes
- No media provider bypass
- Test coverage requirements
- File line count limits
