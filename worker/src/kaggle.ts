/**
 * Kaggle trigger for the Cloudflare Worker (phase 1 feasibility code).
 *
 * Starts a Kaggle GPU run without any PC: the Worker pushes a new version of a
 * private *script* kernel (which makes Kaggle run it), then polls its status.
 *
 * Wire format VERIFIED from the official client source (kaggle 2.2.5 /
 * kagglesdk 0.1.38, read on 2026-11-20). See docs/feasibility-kaggle-trigger.md.
 *
 *   POST https://api.kaggle.com/v1/kernels.KernelsApiService/SaveKernel
 *   POST https://api.kaggle.com/v1/kernels.KernelsApiService/GetKernelSessionStatus
 *   - JSON body, camelCase field names (kagglesdk FieldMetadata json names)
 *   - Content-Type: application/json
 *   - Auth: "Authorization: Bearer <KAGGLE_API_TOKEN>" (new tokens) OR
 *           HTTP Basic "<username>:<key>" (legacy kaggle.json keys)
 *
 * The older third-party description (POST https://www.kaggle.com/api/v1/kernels/push)
 * is the pre-kagglesdk REST route; the current client no longer uses it.
 *
 * NOT VERIFIED until the owner has a Kaggle account: that the server accepts
 * these calls from a Worker, that a push really starts a GPU run without a
 * phone-verified browser session, and that Kaggle Secrets stay attached to
 * versions created through the API.
 */

const KAGGLE_API_BASE = "https://api.kaggle.com/v1";
const KERNELS_SERVICE = "kernels.KernelsApiService";

export interface KaggleEnv {
  /** Kaggle username (also the kernel owner). */
  KAGGLE_USERNAME: string;
  /**
   * Either a legacy API key (32 hex chars from kaggle.json -> HTTP Basic) or a
   * new-style API token from kaggle.com/settings/api (-> Bearer).
   * Set with `wrangler secret put KAGGLE_KEY`. Never commit a value.
   */
  KAGGLE_KEY: string;
}

/** Status names exactly as the KernelWorkerStatus enum in kagglesdk. */
export type KernelStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETE"
  | "ERROR"
  | "CANCEL_REQUESTED"
  | "CANCEL_ACKNOWLEDGED"
  | "NEW_SCRIPT";

export interface PushOptions {
  /** Kernel slug, e.g. "lyric-pipeline-runner". Title must slugify to it. */
  slug: string;
  /** Human title, at least 5 characters. */
  title: string;
  /** Python source of the script kernel (see bootstrapSource). */
  source: string;
  /** "NvidiaTeslaT4" is the default GPU (T4 x2); "NvidiaL4" also exists. */
  machineShape?: string;
  /** Hard stop in seconds; Kaggle caps a session at 12 h anyway. */
  sessionTimeoutSeconds?: number;
  /** Attached Kaggle datasets "owner/dataset" (e.g. cached model weights). */
  datasetSources?: string[];
  /** Attached Kaggle models "owner/model/framework/variation/version". */
  modelSources?: string[];
}

export interface PushResult {
  ref: string;
  url: string;
  versionNumber?: number;
  kernelId?: number;
  error?: string;
  invalidDatasetSources?: string[];
  invalidModelSources?: string[];
}

export interface StatusResult {
  status: KernelStatus;
  failureMessage?: string;
}

export class KaggleApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "KaggleApiError";
  }
}

/** Legacy keys are 32 lowercase hex chars; anything else is treated as a Bearer token. */
function authHeader(env: KaggleEnv): string {
  const key = env.KAGGLE_KEY.trim();
  if (/^[0-9a-f]{32}$/.test(key)) {
    return "Basic " + btoa(`${env.KAGGLE_USERNAME}:${key}`);
  }
  return `Bearer ${key}`;
}

async function call<T>(env: KaggleEnv, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${KAGGLE_API_BASE}/${KERNELS_SERVICE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(env),
      "Content-Type": "application/json",
      "User-Agent": "lyric-video-agent/0.1 (+cloudflare-worker)",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  // kagglesdk treats a JSON body with code >= 400 as an error even on HTTP 200.
  const code = typeof json.code === "number" ? json.code : res.status;
  if (!res.ok || code >= 400) {
    const msg = typeof json.message === "string" ? json.message : text.slice(0, 300);
    throw new KaggleApiError(`Kaggle ${method} failed (${code}): ${msg}`, code, text);
  }
  return json as T;
}

/**
 * Create or update the private script kernel and start a run
 * (equivalent of `kaggle kernels push` without --no-run).
 */
export async function pushKernel(env: KaggleEnv, opts: PushOptions): Promise<PushResult> {
  if (opts.title.length < 5) throw new Error("Kaggle requires a title of at least 5 characters");
  const body = {
    slug: `${env.KAGGLE_USERNAME}/${opts.slug}`,
    newTitle: opts.title,
    text: opts.source,
    language: "python",
    kernelType: "script",
    isPrivate: true,
    enableGpu: true,
    enableTpu: false,
    enableInternet: true,
    machineShape: opts.machineShape ?? "NvidiaTeslaT4",
    datasetDataSources: opts.datasetSources ?? [],
    kernelDataSources: [],
    competitionDataSources: [],
    modelDataSources: opts.modelSources ?? [],
    categoryIds: [],
    ...(opts.sessionTimeoutSeconds ? { sessionTimeoutSeconds: opts.sessionTimeoutSeconds } : {}),
  };
  const result = await call<PushResult>(env, "SaveKernel", body);
  if (result.error) {
    throw new KaggleApiError(`Kaggle push rejected: ${result.error}`, 200, JSON.stringify(result));
  }
  return result;
}

/** Status of the latest run (equivalent of `kaggle kernels status owner/slug`). */
export async function kernelStatus(env: KaggleEnv, slug: string): Promise<StatusResult> {
  const r = await call<{ status?: string; failureMessage?: string }>(env, "GetKernelSessionStatus", {
    userName: env.KAGGLE_USERNAME,
    kernelSlug: slug,
  });
  // kagglesdk omits fields equal to their default; the default status is QUEUED.
  const status = (r.status ?? "QUEUED").toUpperCase() as KernelStatus;
  return { status, failureMessage: r.failureMessage };
}

export function isFinished(s: KernelStatus): boolean {
  return s === "COMPLETE" || s === "ERROR" || s === "CANCEL_ACKNOWLEDGED";
}

/**
 * Python source for the script kernel. It holds no secrets: everything
 * sensitive comes from Kaggle Secrets (Add-ons -> Secrets in the notebook
 * editor, attached once by the owner).
 */
export function bootstrapSource(jobId: string, workerApiUrl: string): string {
  // JSON.stringify gives a valid, escaped Python string literal for ASCII/UTF-8 text.
  const job = JSON.stringify(jobId);
  const api = JSON.stringify(workerApiUrl);
  return `# Auto-generated by the Cloudflare Worker. Do not put secrets in this file.
import json, os, subprocess, sys, urllib.request

JOB_ID = ${job}
WORKER_API_URL = ${api}

from kaggle_secrets import UserSecretsClient
_secrets = UserSecretsClient()

def secret(name, required=True):
    try:
        return _secrets.get_secret(name)
    except Exception as e:
        if required:
            raise RuntimeError(f"Kaggle secret {name} is not attached to this notebook") from e
        return None

WORKER_API_TOKEN = secret("WORKER_API_TOKEN")
GITHUB_TOKEN = secret("GITHUB_TOKEN")  # fine-grained, read-only on rev-001/claude-agent

def report(stage, **extra):
    data = json.dumps({"jobId": JOB_ID, "stage": stage, **extra}).encode()
    req = urllib.request.Request(
        WORKER_API_URL.rstrip("/") + "/api/jobs/" + JOB_ID + "/events",
        data=data,
        headers={"Authorization": "Bearer " + WORKER_API_TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print("report failed:", e, file=sys.stderr)

report("kaggle_started", gpu=os.path.exists("/dev/nvidia0"))

# TODO(phase 2): fetch the pipeline from the private repo and run it, e.g.
#   subprocess.run(["git", "clone", "--depth", "1",
#       f"https://x-access-token:{GITHUB_TOKEN}@github.com/rev-001/claude-agent.git", "/kaggle/working/repo"],
#       check=True)
#   subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "/kaggle/working/repo/kaggle/requirements.txt"], check=True)
#   subprocess.run([sys.executable, "/kaggle/working/repo/kaggle/run_jobs.py", "--job", JOB_ID,
#       "--worker", WORKER_API_URL], check=True)
# Never print GITHUB_TOKEN; strip it from git remotes after cloning.

report("kaggle_finished")
`;
}
