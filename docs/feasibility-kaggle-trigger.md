# Feasibility: starting Kaggle GPU runs from a Cloudflare Worker

Goal: the Cloudflare Worker (cron or dashboard button) starts a Kaggle GPU run
for queued jobs, with nothing running on the owner's PC. Code:
[`worker/src/kaggle.ts`](../worker/src/kaggle.ts).

Research date: 2026-11-20. Sources read: the official PyPI packages
`kaggle` 2.2.5 (`kaggle/api/kaggle_api_extended.py`) and `kagglesdk` 0.1.38
(`kaggle_http_client.py`, `kaggle_env.py`, `kaggle_object.py`,
`kernels/services/kernels_api_service.py`, `kernels/types/kernels_api_service.py`,
`kernels/types/kernels_enums.py`), plus `docs/kernels.md` in the
Kaggle/kaggle-api GitHub repo.

## What the source says

| Item | Third-party docs said | Official source says |
|---|---|---|
| Push URL | `POST https://www.kaggle.com/api/v1/kernels/push` | **Corrected:** `POST https://api.kaggle.com/v1/kernels.KernelsApiService/SaveKernel` (`_get_request_url` → `{endpoint}/v1/{service}/{method}`; PROD endpoint is `https://api.kaggle.com`). The old route belongs to the pre-`kagglesdk` client. |
| Status URL | `GET .../kernels/status` | `POST https://api.kaggle.com/v1/kernels.KernelsApiService/GetKernelSessionStatus`, body `{"userName", "kernelSlug"}` (optional `versionLabel`) |
| Body | form/JSON | JSON, camelCase names from `FieldMetadata` (`newTitle`, `kernelType`, `enableGpu`, `enableInternet`, `isPrivate`, `machineShape`, `sessionTimeoutSeconds`, `datasetDataSources`, `modelDataSources`, …) |
| Auth | HTTP Basic `username:key` | **Both** work in the client: `Authorization: Bearer <KAGGLE_API_TOKEN>` (new tokens from kaggle.com/settings/api, preferred), else HTTP Basic with `username`/`key` (from `KAGGLE_USERNAME`/`KAGGLE_KEY` env vars or `kaggle.json`). |
| XSRF | — | Not needed: `_fill_xsrf_token` is commented out in `_init_session`. |
| Status values | — | `QUEUED, RUNNING, COMPLETE, ERROR, CANCEL_REQUESTED, CANCEL_ACKNOWLEDGED, NEW_SCRIPT` (enum `.name`); default fields are omitted from JSON, so a missing `status` means `QUEUED`. |
| Errors | — | HTTP status, or a JSON body with `code >= 400` and `message`. `SaveKernelResponse.error` carries push validation errors. |
| Accelerator | `enable_gpu` | `enableGpu: true` plus `machineShape`: `NvidiaTeslaT4` (T4 ×2, default), `NvidiaL4`; `NvidiaTeslaP100` is retired (falls back to T4). |
| Push = run | yes | Yes: push without `--no-run` saves a version and runs it (`kernelExecutionType` `QUICK_SAVE` is the no-run case). |
| Metadata rules | — | Title ≥ 5 chars and should slugify to the slug; language `python`; kernel type `script` or `notebook`. |

## Verified vs unverified

| # | Item | State |
|---|---|---|
| 1 | Endpoint URLs, method names, JSON field names, auth schemes, status enum | ✅ Verified from official source (client side) |
| 2 | Kaggle allows GPU + internet on a private script kernel pushed by API | ✅ Supported by the client (`enable_gpu`, `enable_internet`, `is_private`) — server behaviour 🟠 unverified |
| 3 | The server accepts these calls from a Cloudflare Worker (no Cloudflare-IP block, no bot check) | 🟠 Unverified |
| 4 | A phone-verified account can start a **GPU + internet** run through the API alone | 🟠 Unverified |
| 5 | Kaggle Secrets attached once in the editor stay attached to versions pushed by the API | 🟠 Unverified |
| 6 | Status polling every few minutes is within Kaggle's rate limits | 🟠 Unverified |
| 7 | Kaggle's terms allow this use (automated runs of a personal content pipeline) | 🔴 Unclear — keep everything portable |
| 8 | Legacy keys vs new tokens: the Worker treats a 32-hex `KAGGLE_KEY` as Basic, anything else as Bearer | ✅ Matches the client; which key type the owner gets is decided at account creation |

## Design

```
Cron Trigger / dashboard "Run now"
  └─ Worker: pick queued jobs from D1 (batch), check GPU budget
       └─ pushKernel({slug:"lyric-pipeline-runner", source: bootstrapSource(batchId, WORKER_URL)})
            └─ Kaggle runs the script kernel on a T4:
                 reads secrets (UserSecretsClient) → clones this repo (TODO) → pip install
                 → runs jobs → writes to Google Drive → POSTs progress to the Worker → exits
  └─ Cron every 5 min: kernelStatus() until COMPLETE/ERROR → update D1
```

- One kernel slug, re-pushed per batch (each push is a new version). Batching
  amortises the 3–5 min setup.
- The kernel source holds only the job id and Worker URL. Secrets
  (`WORKER_API_TOKEN`, `GITHUB_TOKEN`, Google tokens, …) live in Kaggle Secrets.
- `GITHUB_TOKEN` is a fine-grained token, read-only, on this repo only.
- Fallback if the API trigger fails (item 3/4/5): the Worker writes the job to D1,
  and the owner taps **Run** / **Save Version** on the kernel in the Kaggle app;
  the kernel pulls pending jobs from the Worker instead of having them baked in.

## Test plan (once the owner has a phone-verified Kaggle account)

1. Create the kernel once in the browser: new notebook → File → *Script*,
   title `Lyric Pipeline Runner`, Accelerator GPU T4 ×2, Internet on,
   attach secrets `WORKER_API_TOKEN` and `GITHUB_TOKEN` (dummy values first).
2. Create an API token at kaggle.com/settings/api. Store it **only** with
   `wrangler secret put KAGGLE_KEY` (and `KAGGLE_USERNAME`) — never in chat or git.
3. Deploy a throwaway Worker route that calls `pushKernel` with
   `bootstrapSource("test-1", <worker url>)`. Expect `ref`, `url`, `versionNumber`.
   → verifies items 3, 4.
4. Poll `kernelStatus` every minute: expect `QUEUED → RUNNING → COMPLETE`.
   → verifies item 6.
5. Check the Worker received `kaggle_started` with `gpu: true` and
   `kaggle_finished`. → verifies items 2, 5.
6. Negative tests: wrong key → 401; title < 5 chars → client error; push while a
   run is active → record what Kaggle returns.
7. Record GPU hours used (Kaggle → Settings → quota) for a 1-minute run.
8. Write results into this file; flip rows to ✅ or ❌. If ❌, switch to the
   tap-Run fallback.
