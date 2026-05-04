# Incubot KB AI Admin Plan

## Task Type

Feature / architecture.

## Current Behavior

- Telegram webhook lives in `supabase/functions/telegram-webhook/index.ts`.
- Incoming Telegram messages are saved to `clients`, `dialogs`, and `messages`.
- If a dialog has no active manager assignment, the Edge Function searches `knowledge_chunks` with `match_knowledge_chunks`.
- Embeddings are generated through OpenRouter with `openai/text-embedding-3-small`.
- Chat completion currently uses `deepseek/deepseek-chat` through OpenRouter.
- Knowledge base is currently synced from local files in `knowledge/` by `scripts/sync-knowledge.mjs`.
- `instructions.md` documents the previous file-based KB flow, not the requested admin-managed KB flow.

## Target Behavior

- Knowledge base is stored and managed in Supabase from the admin UI.
- Admins can create, edit, delete, publish/unpublish, and reindex articles.
- Each article receives OpenAI-compatible embeddings and searchable chunks.
- Telegram bot uses vector search over Supabase KB and answers from matched articles.
- Bot handles common intents before AI: greeting, thanks, agreement, goodbye, manager request.
- Each client can have AI enabled or disabled.
- AI fallback to manager works when AI is disabled, context is weak, manager is requested, or generation fails.
- Incoming messages, outgoing assistant messages, and AI decisions are saved in Supabase.
- RLS remains enabled and explicit for all new tables.
- Deno Edge Function remains deployable.
- `instructions.md` becomes a complete restore document with commands, SQL, code, files, checks, and deployment steps.
- Changes are committed and pushed so Vercel can deploy `https://incubot.vercel.app/`.

## Implementation Plan

- [x] Inspect existing DB/API/UI boundaries for minimal integration points.
- [x] Add Supabase migration for admin-managed KB, AI client toggle, and AI decision history.
- [x] Add server-side KB/admin API routes in Next.js using service role and current auth checks.
- [x] Add admin UI for KB article CRUD and reindex operations.
- [x] Update Telegram Edge Function to:
  - [x] classify typical intents;
  - [x] respect per-client AI toggle;
  - [x] search KB articles/chunks;
  - [x] generate response using OpenAI chat model through OpenRouter;
  - [x] save AI decision records;
  - [x] save assistant replies.
- [x] Replace local file-only KB sync path with DB reindex flow while keeping scripts only if useful for bootstrap.
- [x] Update env examples and package scripts if required.
- [x] Rewrite `instructions.md` fully with:
  - [x] project structure;
  - [x] all required files and code;
  - [x] SQL migrations and RLS;
  - [x] Deno function deploy commands;
  - [x] Supabase/Vercel env setup;
  - [x] Telegram webhook setup;
  - [x] verification checklist;
  - [x] git/Vercel deployment commands.
- [x] Run targeted verification:
  - [x] TypeScript/lint or build for Next.js;
  - [x] Deno check for Edge Function if available;
  - [x] SQL review for migration safety;
  - [x] no unrelated file changes.
- [x] Commit and push after verification.

## Model Decision

Use OpenRouter as the single AI gateway, but switch the default chat model from `deepseek/deepseek-chat` to an OpenAI model available through OpenRouter. This keeps the current provider integration and env structure stable while satisfying the requirement to use OpenAI-style embeddings and improving answer quality.

Proposed defaults:

- `OPENROUTER_MODEL=openai/gpt-4o-mini`
- `OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small`
