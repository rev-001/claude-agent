# Lyric Video Agent Team

A free, cloud-only team of agents that turns the owner's Tamil / English / mixed
song lyrics into lyric videos and, **only after the owner approves**, posts them
to YouTube and Instagram.

- **No credit card**, nothing runs or is stored on the owner's PC.
- Songs: ACE-Step 1.5 (MIT, commercial use allowed per its model card) on Kaggle's free GPU.
- Every post needs an explicit owner approval in the dashboard.

Details: [agent team plan](docs/agent-team-plan.md) ·
[walkthrough & catches](docs/walkthrough-and-catches.md) ·
[Kaggle trigger feasibility](docs/feasibility-kaggle-trigger.md)

## Architecture

```
 Owner (phone / browser)
   │  lyrics, style, approvals
   ▼
 ┌──────────────────────────────┐      ┌───────────────────────────────┐
 │ Cloudflare Pages dashboard    │◄────►│ Cloudflare Worker + D1        │
 │ (behind Cloudflare Access,    │ API  │ Orchestrator: queue, state,   │
 │  owner's email only)          │      │ limits, approvals, Cron       │
 └──────────────────────────────┘      └──────┬───────────┬────────────┘
                                              │ push run  │ publish (after approval)
                                              ▼           ▼
                          ┌─────────────────────────┐  ┌──────────────────────┐
                          │ Kaggle notebook (GPU)    │  │ YouTube Data API v3   │
                          │ ACE-Step → stable-ts →   │  │ Instagram Graph API   │
                          │ librosa → Remotion → QA  │  └──────────────────────┘
                          │ Gemini (text), Pexels    │
                          └───────────┬─────────────┘
                                      ▼
                          ┌─────────────────────────┐
                          │ Owner's Google Drive     │  videos deleted after posting
                          └─────────────────────────┘
```

## Folders

| Folder | Contents |
|---|---|
| `dashboard/` | Cloudflare Pages app: song intake, preview, timing nudge, approve/reject |
| `worker/` | Cloudflare Worker: orchestrator API, D1 schema, cron, Kaggle trigger, publishers |
| `kaggle/` | Python pipeline run on Kaggle: song maker, lyric sync, hook finder, QA, Drive I/O |
| `remotion/` | Remotion project: style presets, 16:9 full video and 9:16 hook compositions |
| `docs/` | Plan, walkthrough, catches, feasibility notes |

## Setup order

1. **GitHub** ✅ (this private repo)
2. **Cloudflare** — free account; Pages, Workers, D1, Access (Zero Trust free plan)
3. **Kaggle** — free account, **phone verification** (needed for GPU and internet)
4. **Google Cloud project** — enable **YouTube Data API v3** and **Google Drive API**;
   OAuth consent screen set to **In production** (Testing mode tokens expire in 7 days);
   **apply for the YouTube API audit** on day 1
5. **Meta developer app** — Instagram Graph API for the owner's Business/Creator account

Secrets are never committed. Names only are listed in [`.env.example`](.env.example);
values go into Cloudflare (`wrangler secret put`) and Kaggle Secrets.

GitHub Actions is **not** used to run the pipeline (GitHub's terms limit hosted
runners to software-project work).
