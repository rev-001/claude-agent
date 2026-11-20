# worker/

Planned: Cloudflare Worker + D1 + Cron Triggers (Orchestrator, Intake & Rights, Publisher, Analytics).

- `src/kaggle.ts` — starts Kaggle GPU runs and polls their status (phase 1, see `docs/feasibility-kaggle-trigger.md`)
- `src/api.ts` — dashboard API and the events endpoint the Kaggle run reports to (planned)
- `src/publish/youtube.ts`, `src/publish/instagram.ts` — uploads after owner approval (planned)
- `schema.sql` — D1 tables: songs, rights, jobs, events, approvals, posts, stats (planned)
- `wrangler.toml` — bindings and cron schedules (planned)

Secrets are set with `wrangler secret put`, never committed. Local dev values go in `.dev.vars` (git-ignored).
