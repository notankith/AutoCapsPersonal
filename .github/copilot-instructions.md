# AutoCapsPersonal AI Instructions

## 🚨 CRITICAL CONTEXT: MIGRATION STATUS
**IGNORE `README.md` ARCHITECTURE SECTIONS.**
This project has migrated **FROM** Supabase **TO** MongoDB + Oracle Object Storage.
- **Database:** MongoDB (Native Driver)
- **Storage:** Oracle Object Storage (PAR URL)
- **Auth:** Temporarily DISABLED (Supabase Auth removed)

## 🏗 Architecture & Stack

### Core Components
- **Frontend:** Next.js 15+ (App Router), React 19, Tailwind CSS, Shadcn UI.
- **Backend:** Next.js API Routes (`app/api/`) + Standalone Node.js Worker.
- **Database:** MongoDB. Connection via `lib/mongodb.ts`.
- **Storage:** Oracle Object Storage. Helpers in `lib/oracle-storage.ts`.
- **Video Processing:** `scripts/ffmpeg-worker.ts` (Standalone HTTP server using `ffmpeg-static`).
- **AI Services:** AssemblyAI (Transcription), OpenAI (Translation).

### Data Flow
1.  **Uploads:**
    - Client requests upload URL: `POST /api/videos/upload`
    - Server generates Oracle PAR URL + creates MongoDB `uploads` doc.
    - Client PUTs file directly to Oracle Storage.
2.  **Jobs (Transcribe/Translate/Render):**
    - Client triggers job via API.
    - API updates MongoDB `jobs` collection.
    - **Render Jobs:** API notifies Worker via HTTP POST. Worker updates MongoDB status.

## 🛠 Developer Workflows

### Running the Project
Requires **two** terminal processes:
1.  **Web App:** `pnpm dev` (Runs Next.js on localhost:3000)
2.  **Worker:** `pnpm worker` (Runs FFmpeg worker on port 8787)

### Database Access
- **Do NOT use Mongoose.** Use the native MongoDB driver.
- **Pattern:**
  ```typescript
  import { getDb } from "@/lib/mongodb"
  const db = await getDb()
  const result = await db.collection("uploads").findOne({ _id: new ObjectId(id) })
  ```

### Storage Access
- **Pattern:** Use `lib/oracle-storage.ts`.
- **Upload:** `getPublicUrl(path)` for client-side uploads.
- **Download:** `downloadFile(path)` or use the public URL directly.

## 🧩 Key Conventions

- **Auth Handling:** Auth is currently disabled. `userId` is often passed in request body or defaulted to `"default-user"`. **Do not re-introduce Supabase Auth.**
- **File Paths:**
  - Uploads: `uploads/{userId}/{uploadId}/{filename}`
  - Captions: `captions/{userId}/{uploadId}/{jobId}.{ext}`
  - Renders: `renders/{userId}/{uploadId}/{filename}`
- **Environment Variables:**
  - `MONGODB_URI`, `MONGODB_DB_NAME`
  - `ORACLE_PAR_URL` (Must end with `/`)
  - `WORKER_JWT_SECRET` (Shared between Next.js and Worker)

## 📂 Critical Files
- `lib/mongodb.ts`: Database connection source of truth.
- `lib/oracle-storage.ts`: Storage logic.
- `scripts/ffmpeg-worker.ts`: Video rendering logic (FFmpeg commands).
- `app/api/videos/`: API route definitions.
- `MIGRATION_SUMMARY.md`: Accurate architectural reference.
