# Agent team plan

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Payment | No credit card anywhere | Owner requirement; rules out Oracle and other card-verified clouds |
| Owner's PC | Runs and stores nothing | Owner requirement; everything is cloud |
| Compute | Kaggle notebooks only (free GPU) | Only free, no-card GPU with internet |
| Song generation | ACE-Step 1.5 (MIT; commercial use allowed per model card; 10 s–10 min; 50+ languages) | Gemini free-plan songs rejected: 30 s cap, no commercial-use terms, stock-music Content ID reports |
| Tamil song quality | Untested → phase 1 test | Unknown risk |
| Posting | Owner approves every post | Owner requirement |
| Channels | Existing YouTube channel + Instagram Business/Creator account | Already owned |
| Pipeline runner | Not GitHub Actions | Its terms limit hosted runners to software-project work |
| Portability | Pipeline is plain Python + Node, no Kaggle-only lock-in | Kaggle's terms are unclear for this use |

## Agents

| # | Agent | Runs on | Job |
|---|---|---|---|
| 0 | Orchestrator | Worker + D1 | Job state machine, limits, retries, approvals, Kaggle trigger |
| 1 | Intake & Rights | Worker | Records song source and licence; **blocks songs without commercial rights** |
| 2 | Song Maker | Kaggle GPU | Lyrics + style prompt → ACE-Step 1.5 → WAV |
| 3 | Lyric Sync | Kaggle GPU | stable-ts forced alignment of the owner's **own** lyrics (no transcription guessing); Tamil fonts Noto Sans Tamil / Catamaran / Mukta Malar |
| 4 | Hook Finder | Kaggle | librosa energy + repetition (chroma self-similarity) → 15–30 s hook |
| 5 | Creative Director | Kaggle + Gemini | Picks a style preset per song so videos vary; uses analytics feedback |
| 6 | Renderer | Kaggle | Remotion renders 16:9 full video + 9:16 hook; MoneyPrinterTurbo used **only** to fetch Pexels b-roll, voice-over off |
| 7 | Packaging/SEO | Kaggle + Gemini | Titles, descriptions, Tamil/English hashtags, thumbnail |
| 8 | QA Reviewer | Kaggle | Sync drift, typos vs source lyrics, −14 LUFS loudness, safe zones, length |
| 9 | Publisher | Worker | Only after owner approval. YouTube upload **Private** first → public after owner checks copyright; Instagram via resumable upload |
| 10 | Analytics | Worker cron | Daily stats → Creative Director |

## Workflow

```
dashboard → Intake & Rights → [Song Maker] → Lyric Sync
          → (Hook Finder ∥ Creative Director) → Renderer
          → QA (max 2 retries, then flag for owner) → Packaging/SEO
          → preview in dashboard → OWNER APPROVES → Publisher → Analytics
```

`[Song Maker]` is skipped when the owner uploads a finished song with recorded rights.

## Style presets (Creative Director)

| Preset | Look | Good for |
|---|---|---|
| Kinetic typography | Words animate in on the beat | Upbeat, rap, fast lyrics |
| VHS / film grain | Retro texture, warm grade, jitter | Nostalgic, melody |
| Paper cutout | Layered paper shapes, stop-motion feel | Folk, kids, playful |
| Minimal one-word | One big word at a time, plain background | Emotional, slow |
| Pexels b-roll + karaoke | Background clips, karaoke highlight | General; b-roll stays background only |
| Audio-reactive | Shapes/bars driven by spectrum and beats | EDM, instrumental-heavy |

Rules: never the same preset twice in a row; colour, font and motion vary
inside a preset; Tamil text uses only the listed Tamil fonts.

## Free stack

| Need | Tool | Free limit to watch |
|---|---|---|
| Dashboard | Cloudflare Pages + Cloudflare Access | Access free plan (owner's email only) |
| Queue / state / scheduler | Cloudflare Workers + D1 + Cron Triggers | Workers 100k req/day; D1 5 GB |
| GPU | Kaggle notebooks | ~30 GPU h/week (floating), 12 h per session, internet on |
| Files | Owner's Google Drive | 15 GB shared with Gmail; delete videos after posting |
| LLM | Gemini API free tier | Rate limits; text only |
| Stock video | Pexels API | Free key; attribution recommended |
| Code | This private repo | — |

## Safety limits

- No post without an explicit owner approval recorded in D1 (who, when, which file hash).
- YouTube uploads start **Private**; public only after the owner's copyright check.
- Max uploads: YouTube 3/day, Instagram 3/day (below API quotas).
- Max 2 QA retries per job; then stop and flag the owner.
- Kaggle: max 1 running session; stop starting runs at 25 GPU h/week.
- Intake blocks any song without a recorded commercial-use licence.
- Secrets only in Cloudflare secrets and Kaggle Secrets; never in git, logs or chat.
- Watermark (channel name) on every video.

## Build phases

1. **Feasibility** — Kaggle API trigger from a Worker; ACE-Step Tamil quality test.
2. **Kaggle pipeline** — tested end to end on one real song (files to Drive).
3. **Dashboard + queue** — Pages, Access, Worker, D1, cron.
4. **Publishing** — YouTube (after audit) and Instagram, behind owner approval.
5. **Analytics** — daily stats feeding the Creative Director.
