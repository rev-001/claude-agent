# kaggle/

Planned: the Python pipeline the Kaggle notebook runs. Each run installs its
dependencies, pulls pending jobs from the Worker, processes them, writes files
to the owner's Google Drive, reports progress, and exits.

- `run_jobs.py` — entry point
- `song_maker.py` — ACE-Step 1.5 generation
- `lyric_sync.py` — stable-ts forced alignment of the owner's own lyrics
- `hook_finder.py` — librosa energy + repetition → 15–30 s hook
- `creative_director.py`, `packaging.py` — Gemini prompts
- `qa.py` — sync drift, typos, −14 LUFS, safe zones, length
- `drive.py` — Google Drive upload/delete
- `requirements.txt`

Secrets come from Kaggle Secrets (`kaggle_secrets.UserSecretsClient`), never from files.
Kept portable: nothing here should depend on Kaggle beyond the secrets helper and paths.
