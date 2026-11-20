# Walkthrough and catches

## One-time setup

| Step | Where | What the owner does | Time |
|---|---|---|---|
| 1 | GitHub | ✅ Private repo `rev-001/claude-agent` | done |
| 2 | Cloudflare | Free account → Workers & Pages, D1 database, Zero Trust (free) → Access app for the dashboard, owner's email only | 20 min |
| 3 | Kaggle | Free account → **phone verification** → create API token (store only as a Cloudflare secret) → create the runner kernel and attach Kaggle Secrets | 20 min |
| 4 | Google Cloud | New project → enable YouTube Data API v3 + Drive API → OAuth consent screen **In production** → OAuth client → one-time consent to get a refresh token → **apply for the YouTube API audit** | 45 min + audit wait (weeks) |
| 5 | Meta | Developer app → Instagram Graph API → link the Business/Creator account → long-lived token | 30 min |
| 6 | Pexels, Gemini | Free API keys | 10 min |

## Flow for each song

| # | Step | Who | Time (estimate) |
|---|---|---|---|
| 1 | Paste lyrics, pick language/mood (or upload a song with its licence) | Owner | 2–5 min |
| 2 | Intake & Rights check | Worker | seconds |
| 3 | Wait for the next batch run (Kaggle cron or owner taps Run) | — | 0–60 min |
| 4 | Kaggle setup (install deps, load models) | Kaggle | 3–5 min per run |
| 5 | Song Maker (ACE-Step, 3–4 min song) | Kaggle GPU | 2–5 min |
| 6 | Lyric Sync (stable-ts) | Kaggle GPU | 1–2 min |
| 7 | Hook Finder + Creative Director | Kaggle + Gemini | < 1 min |
| 8 | Render 16:9 full + 9:16 hook (Remotion) | Kaggle | 10–25 min |
| 9 | QA (+ up to 2 retries) and Packaging | Kaggle + Gemini | 1–3 min (+ re-renders) |
| 10 | Review preview, nudge timings, approve | Owner | 5–10 min |
| 11 | Upload YouTube (Private) + Instagram | Worker | 2–5 min |
| 12 | Copyright check in Studio → set Public | Owner | 2 min, after 1–24 h |

Roughly 25–45 min of Kaggle time and 10–20 min of owner time per song.
Until the YouTube audit passes, step 11 for YouTube is manual: the owner downloads
from Drive on their phone and uploads in YouTube Studio (title, description and
hashtags are ready to copy).

## Catches

| Sev | Catch | Fix |
|---|---|---|
| 🔴 | YouTube locks uploads from **unaudited** API projects as Private; they can't be appealed | Apply for the audit on day 1; meanwhile the agent prepares everything and the owner uploads manually in Studio |
| 🔴 | OAuth consent in **Testing** gives 7-day refresh tokens | Set the consent screen to **In production** |
| 🔴 | Monetization is slow: YPP needs 1,000 subs + 4,000 watch hours, or 10M Shorts views in 90 days; the July 2026 inauthentic-content policy demonetizes templated videos | Vary styles per song (Creative Director); Instagram mainly for growth |
| 🔴 | Kaggle's terms neither clearly allow nor forbid this use | Keep everything portable (plain Python/Node, Drive storage) |
| 🟠 | Starting Kaggle runs automatically through the API is unverified | Feasibility test; fallback: owner taps Run |
| 🟠 | ACE-Step Tamil quality unknown; output might resemble existing songs | Test first; Private-first upload and owner's copyright check |
| 🟠 | Kaggle setup takes 3–5 min per run; GPU quota floats | Batch jobs per run; budget GPU hours |
| 🟠 | Tamil alignment drift | QA drift check + dashboard timing-nudge tool |
| 🟡 | Instagram token lasts 60 days | Scheduled refresh job |
| 🟡 | Instagram needs a public URL or a resumable upload | Use resumable upload |
| 🟡 | Remotion is free only for teams of ≤ 3 people | Stay ≤ 3; re-check licence if the team grows |
| 🟡 | Drive's 15 GB is shared with Gmail | Delete videos after posting; keep only project files |
| 🟡 | AI songs can't easily be registered in Content ID | Watermark every video |
| 🟡 | Stock clips are widely reused | Keep b-roll as background only, lyrics are the content |
| 🟢 | Quotas (YouTube ≈ 6 uploads/day) | Fine for 1–3 songs/day |
