## AutoCaps.ai Backend Demo

Functional demo backend for the AutoCaps.ai pipeline: upload → transcribe → translate → style → render → download. The frontend (already built) talks to these API routes via Vercel functions while Supabase powers auth/data/storage.

### Core Stack

- **Next.js API routes** deployed on Vercel
- **Supabase** for Auth (email/password only), Postgres, Storage
- **AssemblyAI streaming transcription** for word-level transcripts
- **OpenAI GPT-4o mini** for translations
- **FFmpeg worker** (JWT-secured Node service using `ffmpeg-static`) for caption burn-in

### Quick Start

```bash
pnpm install
pnpm dev            # Next.js routes
pnpm worker         # FFmpeg worker (separate terminal)
```

### Required Environment

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for authenticated users |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key (server-only) for Storage + admin tasks |
| `SUPABASE_UPLOADS_BUCKET` | Storage bucket for raw uploads (default `uploads`) |
| `SUPABASE_CAPTIONS_BUCKET` | Bucket for generated captions (default `captions`) |
| `SUPABASE_RENDERS_BUCKET` | Bucket for final renders (default `renders`) |
| `OPENAI_API_KEY` | Used for GPT-4o mini translations |
| `ASSEMBLYAI_API_KEY` | Used for `/api/videos/transcribe` |
| `ASSEMBLYAI_MODEL` | Optional AssemblyAI model ID (falls back to default) |
| `ENABLE_OPENAI_MOCKS` | Set to `true` to allow deterministic mock translation data when explicitly requested |
| `ENABLE_TRANSCRIPTION_MOCKS` | Enables deterministic AssemblyAI mocks for `/api/videos/transcribe` when the request sets `useMocks=true` |
| `NEXT_PUBLIC_ENABLE_TRANSCRIPTION_MOCKS` | Mirrors `ENABLE_TRANSCRIPTION_MOCKS` so the UI knows whether it can request mocks |
| `WORKER_JWT_SECRET` | Shared secret between Vercel API and FFmpeg worker |
| `FFMPEG_WORKER_URL` | Public URL where the worker accepts POST `/render` |
| `FFMPEG_WORKER_PORT` | (Worker only) Local port, defaults to `8787` |
| `CRON_SECRET` | Bearer token for retention endpoint |
| `FILE_RETENTION_DAYS` | Optional override for auto-deletion window (defaults to `7`) |

### Supabase Setup

1. Create Storage buckets: `uploads`, `captions`, `renders` (public access recommended for demo).
2. Run `scripts/001_create_tables.sql` in the Supabase SQL editor to provision:
	 - `uploads`, `transcripts`, `translations`, `jobs`, `profiles` tables
	 - RLS policies + triggers
	 - Enums for upload + job statuses
3. Enable email/password auth only inside the Supabase dashboard.

### API Surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/login` | POST | Email/password login via Supabase Auth |
| `/api/auth/sign-up` | POST | Sign up via Supabase Auth |
| `/api/videos/upload` | POST | Issues signed Supabase upload URL + persists metadata |
| `/api/videos/transcribe` | POST | Calls AssemblyAI on stored upload, saves transcript + job |
| `/api/videos/translate` | POST | GPT-4o mini translation of any transcript |
| `/api/videos/render` | POST | Generates caption file, creates render job, notifies worker |
| `/api/jobs/:id` | GET | Poll render/transcribe/translate job status |
| `/api/maintenance/purge` | POST | (Cron) Deletes uploads/renders older than 7 days |

### Typical Frontend Flow

1. **Upload:** Call `/api/videos/upload` with `{ fileName, fileType, fileSize }`. Use the returned `uploadUrl` to `PUT` the file directly to Supabase Storage. Keep `uploadId` for follow-up calls.
2. **Transcribe:** Call `/api/videos/transcribe` with `{ uploadId }`. Response includes `transcriptId`, `segments`, and a `jobId` (status already `done`).
3. **Translate (optional):** Call `/api/videos/translate` with `{ transcriptId, targetLanguage }`. Response includes `translationId` and translated segments.
4. **Render:** Call `/api/videos/render` with `{ uploadId, template, resolution, transcriptId? or translationId? }`. The API stores the caption file, creates a `render` job, and notifies the worker. Poll `/api/jobs/{jobId}` until `status === 'done'` to retrieve the `downloadUrl`.

### Caption Templates

- `glowy` → ASS file with glow/outline styling
- `minimal` → Compact SRT export
- `karaoke` → ASS with `\k` word highlighting (requires per-word timestamps)

### FFmpeg Worker

The worker lives in `scripts/ffmpeg-worker.ts`. It runs separately from Vercel lambdas, verifies JWTs, renders with `ffmpeg-static`, uploads the result to Supabase, and updates the `jobs` + `uploads` tables.

```bash
WORKER_JWT_SECRET=... \
SUPABASE_SERVICE_ROLE_KEY=... \
NEXT_PUBLIC_SUPABASE_URL=... \
pnpm worker
```

Expected POST body from the render route:

```json
{
	"jobId": "...",
	"uploadId": "...",
	"videoUrl": "<signed-download>",
	"captionUrl": "<signed-caption>",
	"captionFormat": "ass" | "srt",
	"template": "glowy" | "minimal" | "karaoke",
	"resolution": "720p" | "1080p",
	"outputPath": "<storage path inside renders bucket>"
}
```

### File Retention

`/api/maintenance/purge` removes uploads, captions, and renders whose `expires_at` is in the past (defaults to 7 days). Protect it with `CRON_SECRET` and run it via Vercel Cron or Supabase edge functions.

### Connecting the Frontend

- Use the provided endpoints directly; each one enforces Supabase Auth through server-side cookies.
- For uploads, send the raw file bytes to `uploadUrl` via `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })`.
- Poll `/api/jobs/:id` for long-running translation/render jobs and surface progress in the UI.
- Handle FFmpeg worker errors by reacting to `job.status === 'failed'`.

### Testing / Verification

- `pnpm lint` – structural checks for the Next.js codebase.
- `pnpm worker` – run worker locally; unit tests are not included for this demo backend.
- If you don't have an OpenAI or AssemblyAI API key yet, either (a) set both `ENABLE_TRANSCRIPTION_MOCKS=true` and `NEXT_PUBLIC_ENABLE_TRANSCRIPTION_MOCKS=true` (the UI will explicitly request mock data) to get deterministic placeholder output, or (b) provide manual overrides:
	- `/api/videos/transcribe` accepts `{ uploadId, override: { rawResponse?, text?, segments?, language? } }`. You can paste the exact AssemblyAI JSON response (preferred) or just supply plain text and the API will build simple segments.
	- `/api/videos/translate` accepts `{ transcriptId, targetLanguage, override: { completion?, segments?, text? } }`. You can paste the GPT chat completion JSON, a list of `{ id, text }` pairs, or a plain translated paragraph.
	- The dashboard upload form now exposes fields to paste either the AssemblyAI JSON payload or plain transcript so you can stay in the UI while testing without API credentials.

### Notes

- No payments/subscriptions/credits/rate-limits are enforced.
- All heavy operations use Supabase Storage and OpenAI; there is no local file persistence beyond temporary worker scratch space.
- Clean, minimal responses with job IDs ensure the frontend can remain responsive while long tasks run asynchronously.

