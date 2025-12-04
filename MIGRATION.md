# Migration Guide: Supabase → MongoDB + Oracle Object Storage

## Overview
AutoCapsPersonal has been migrated from Supabase to MongoDB for database operations and Oracle Object Storage for file storage. All files are now stored in a single Oracle bucket using a PAR (Pre-Authenticated Request) URL.

## Configuration

### 1. Setup Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

#### Oracle Object Storage
```env
ORACLE_PAR_URL=https://objectstorage.<region>.oraclecloud.com/p/<token>/n/<namespace>/b/<bucket>/o/
NEXT_PUBLIC_ORACLE_PAR_URL=https://objectstorage.<region>.oraclecloud.com/p/<token>/n/<namespace>/b/<bucket>/o/
```

**How to get your PAR URL:**
1. Go to Oracle Cloud Console
2. Navigate to Object Storage → Buckets
3. Create or select a bucket
4. Click "Pre-Authenticated Requests"
5. Create new PAR with:
   - Access Type: Read & Write
   - Name: autocaps-storage
   - Expiration: Set appropriate date
   - Permitted Object Name Prefix: (leave empty for all objects)
6. Copy the generated URL (include the `/o/` at the end)

#### MongoDB
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=autocaps
```

**How to get MongoDB URI:**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster (free tier available)
3. Click "Connect" → "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your actual password

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

New dependency added: `mongodb@^6.0.0`

Removed dependencies:
- `@supabase/ssr`
- `@supabase/supabase-js`

## Architecture Changes

### Storage

**Before (Supabase):**
- Separate buckets: `uploads`, `captions`, `renders`
- Signed upload URLs with tokens
- Bucket-specific permissions

**After (Oracle Object Storage):**
- Single bucket for all files
- Files organized by prefix: `uploads/`, `captions/`, `renders/`
- Direct PUT/GET operations via PAR URL
- No per-file authentication needed

### Database

**Before (Supabase PostgreSQL):**
- Tables: `uploads`, `transcripts`, `translations`, `jobs`, `profiles`
- Row-Level Security (RLS) policies
- Supabase Auth for user management

**After (MongoDB):**
- Collections: `uploads`, `transcripts`, `translations`, `jobs`, `profiles`
- Document-based storage
- ObjectId for primary keys
- Flexible schema

### File Structure

```
lib/
├── mongodb.ts           # MongoDB connection & getDb()
├── oracle-storage.ts    # Upload/download helpers
├── pipeline.ts          # Updated with STORAGE_PREFIX instead of STORAGE_BUCKETS
└── supabase/           # Stub files (prevent import errors)
    ├── server.ts
    ├── client.ts
    └── admin.ts
```

## API Changes

### Upload Flow

**Before:**
1. Client calls `/api/videos/upload` → Gets signed Supabase URL + token
2. Client uploads to Supabase with FormData + token header
3. Supabase validates and stores file

**After:**
1. Client calls `/api/videos/upload` → Gets Oracle PAR URL
2. Client uploads directly to Oracle with PUT + raw file body
3. Oracle validates PAR token and stores file

### Key Code Changes

#### Upload Component (`components/upload/video-upload-form.tsx`)
```typescript
// OLD: FormData upload to Supabase
const formData = new FormData()
formData.append("file", file)
xhr.send(formData)

// NEW: Raw file upload to Oracle
xhr.open("PUT", uploadUrl)
xhr.setRequestHeader("Content-Type", file.type)
xhr.send(file)
```

#### Upload API (`app/api/videos/upload/route.ts`)
```typescript
// OLD: Supabase signed upload
const { data: signedUpload } = await admin.storage
  .from(STORAGE_BUCKETS.uploads)
  .createSignedUploadUrl(path)

// NEW: Oracle PAR URL
import { getPublicUrl } from "@/lib/oracle-storage"
const uploadUrl = getPublicUrl(storagePath)
```

## Storage Helper Functions

### `lib/oracle-storage.ts`

```typescript
// Upload file
await uploadFile(filename, buffer, contentType)
// Returns: { url, path }

// Download file
const stream = await downloadFile(filename)

// Get public URL
const url = getPublicUrl(filename)

// Delete file (requires DELETE permission in PAR)
await deleteFile(filename)
```

## Database Migration

### Collections Schema

#### `uploads` Collection
```typescript
{
  _id: ObjectId,
  user_id: string,
  file_name: string,
  storage_path: string,  // e.g., "uploads/user-id/upload-id/file.mp4"
  mime_type: string,
  file_size: number,
  duration_seconds: number,
  metadata: object,
  status: string,  // "pending_upload" | "uploaded" | "transcribed" | "rendered"
  expires_at: Date,
  created_at: Date,
  updated_at: Date,
  latest_transcript_id?: ObjectId
}
```

#### `transcripts` Collection
```typescript
{
  _id: ObjectId,
  upload_id: ObjectId,
  user_id: string,
  text: string,
  language: string,
  model: string,
  segments: Array<{
    id: string,
    start: number,
    end: number,
    text: string,
    words: Array<{
      start: number,
      end: number,
      text: string,
      confidence?: number
    }>
  }>,
  created_at: Date
}
```

#### `jobs` Collection
```typescript
{
  _id: ObjectId,
  upload_id: ObjectId,
  user_id: string,
  type: string,  // "render" | "transcribe" | "translate"
  status: string,  // "queued" | "processing" | "done" | "failed"
  payload: object,
  result?: object,
  error?: string,
  started_at?: Date,
  completed_at?: Date,
  created_at: Date
}
```

## Authentication

**Current State:** Middleware auth is disabled (allows all requests)

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  return NextResponse.next({ request })
}
```

**To Implement Custom Auth:**
1. Add JWT token generation on login
2. Store user sessions in MongoDB
3. Verify tokens in middleware
4. Add `user_id` to protected API routes

## File Naming Convention

All files stored in Oracle follow this pattern:
```
{prefix}/{user_id}/{upload_id}/{filename}
```

Examples:
- `uploads/user-123/uuid-456/video.mp4`
- `captions/user-123/uuid-456/job-789.srt`
- `renders/user-123/uuid-456/output.mp4`

## Testing

1. Start development server:
   ```bash
   npm run dev
   ```

2. Test upload flow:
   - Navigate to `/dashboard/upload`
   - Select a video file
   - Upload and verify it reaches Oracle Object Storage
   - Check MongoDB for upload document

3. Verify storage:
   ```bash
   # Check Oracle bucket via console
   # Check MongoDB documents
   ```

## Migration Checklist

- [x] Created MongoDB connection module
- [x] Created Oracle storage helper
- [x] Updated pipeline.ts configuration
- [x] Removed Supabase auth from middleware
- [x] Updated upload API route
- [x] Updated upload components
- [x] Created .env.example
- [x] Updated package.json dependencies
- [ ] Migrate existing Supabase data (if any)
- [ ] Implement custom authentication
- [ ] Update all API routes to use MongoDB
- [ ] Update worker scripts for Oracle storage
- [ ] Test transcription flow
- [ ] Test render flow
- [ ] Update maintenance/cleanup jobs

## Troubleshooting

### "ORACLE_PAR_URL not configured"
- Ensure `.env` has both `ORACLE_PAR_URL` and `NEXT_PUBLIC_ORACLE_PAR_URL`
- PAR URL must end with `/o/`
- Restart dev server after changing .env

### "MongoDB connection failed"
- Verify `MONGODB_URI` is correct
- Check network access in MongoDB Atlas
- Ensure your IP is whitelisted

### Upload fails with 403
- PAR URL might be expired
- Regenerate PAR in Oracle Cloud Console
- Ensure PAR has Read & Write permissions

### Files not appearing in Oracle bucket
- Check PAR permissions (Read & Write required)
- Verify `Content-Type` header is set correctly
- Check browser network tab for upload status

## Next Steps

1. **Implement Auth:** Add JWT-based authentication
2. **Migrate Data:** If you have existing Supabase data, export and import to MongoDB
3. **Update Routes:** Remaining API routes still reference Supabase - update them to use MongoDB
4. **Worker Scripts:** Update FFmpeg worker to use Oracle storage
5. **Cleanup Jobs:** Update maintenance endpoints for Oracle + MongoDB

## Support

For issues or questions:
1. Check Oracle Cloud logs for storage errors
2. Check MongoDB Atlas logs for database errors
3. Check Next.js console for application errors
4. Review `.env.example` for correct variable names
