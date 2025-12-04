# AutoCapsPersonal Migration - Setup Instructions

## Installation Steps

### 1. Install Dependencies
```bash
cd "d:/VSCode Projects/New folder/AutoCapsPersonal"
pnpm install
```

This will install the new `mongodb` package and remove unused Supabase packages.

### 2. Configure Environment Variables

Create a `.env` file in the AutoCapsPersonal directory:

```bash
cp .env.example .env
```

Then edit `.env` with your credentials:

**Required variables:**
- `ORACLE_PAR_URL` - Your Oracle Object Storage PAR URL
- `NEXT_PUBLIC_ORACLE_PAR_URL` - Same as above (for client-side)
- `MONGODB_URI` - Your MongoDB connection string
- `MONGODB_DB_NAME` - Database name (default: "autocaps")

**Optional variables:**
- `ASSEMBLYAI_API_KEY` - For transcription
- `OPENAI_API_KEY` - For translation
- `FILE_RETENTION_DAYS` - File retention period

### 3. Start Development Server

```bash
pnpm dev
```

Navigate to: http://localhost:3000

## What Was Changed

### ✅ Completed
1. **MongoDB Integration**
   - Created `lib/mongodb.ts` with connection pooling
   - Configured for MongoDB Atlas

2. **Oracle Object Storage**
   - Created `lib/oracle-storage.ts` with upload/download helpers
   - Single bucket architecture with PAR URL
   - Direct PUT/GET operations

3. **Updated Upload Flow**
   - `/api/videos/upload` uses Oracle storage
   - Upload component uses PUT method (not FormData)
   - Removed Supabase signed upload URLs

4. **Configuration**
   - Updated `lib/pipeline.ts` (STORAGE_PREFIX instead of STORAGE_BUCKETS)
   - Disabled Supabase auth in `middleware.ts`
   - Created stub files for Supabase imports

5. **Documentation**
   - Created `.env.example`
   - Created `MIGRATION.md` (detailed guide)
   - Created `MIGRATION_SUMMARY.md` (quick reference)

### ⚠️ Remaining Work

These files still import Supabase and need updates:

**High Priority:**
- `app/api/videos/transcribe/route.ts` - Transcription API
- `app/api/videos/render/route.ts` - Render API
- `app/api/videos/delete/route.ts` - Delete API
- `app/dashboard/history/page.tsx` - History page
- `app/dashboard/editor/[uploadId]/page.tsx` - Editor page

**Medium Priority:**
- `app/api/videos/translate/route.ts` - Translation API
- `app/api/videos/export/route.ts` - Export API
- `app/api/auth/**` - All auth routes
- `scripts/ffmpeg-worker.ts` - Render worker

**Low Priority:**
- `scripts/upload-test.ts` - Test scripts
- `app/api/transcripts/**` - Transcript routes
- Other dashboard pages

## Migration Pattern

When updating API routes, follow this pattern:

### Before (Supabase):
```typescript
import { createClient } from "@/lib/supabase/server"

const supabase = await createClient()
const { data, error } = await supabase
  .from("uploads")
  .select("*")
  .eq("id", uploadId)
  .single()
```

### After (MongoDB):
```typescript
import { getDb } from "@/lib/mongodb"
import { ObjectId } from "mongodb"

const db = await getDb()
const upload = await db.collection("uploads").findOne({
  _id: new ObjectId(uploadId)
})
```

### Storage Operations

**Before (Supabase):**
```typescript
const { data, error } = await supabase.storage
  .from("uploads")
  .upload(path, file)

const { data: url } = await supabase.storage
  .from("uploads")
  .createSignedUrl(path, 3600)
```

**After (Oracle):**
```typescript
import { uploadFile, getPublicUrl } from "@/lib/oracle-storage"

const { url, path } = await uploadFile(filename, buffer, contentType)

const publicUrl = getPublicUrl(path)
```

## Testing Checklist

- [ ] Install dependencies successfully
- [ ] Configure .env with Oracle PAR URL
- [ ] Configure .env with MongoDB URI
- [ ] Start dev server without errors
- [ ] Navigate to upload page
- [ ] Upload a test video
- [ ] Verify file appears in Oracle bucket
- [ ] Verify metadata appears in MongoDB
- [ ] Check browser console for errors

## Common Issues

### "Cannot find module 'mongodb'"
**Solution:** Run `pnpm install` to install dependencies

### "ORACLE_PAR_URL not configured"
**Solution:** Add both `ORACLE_PAR_URL` and `NEXT_PUBLIC_ORACLE_PAR_URL` to `.env`

### "MongoDB connection failed"
**Solution:** 
- Verify connection string format
- Check MongoDB Atlas network access
- Whitelist your IP address

### Upload returns 403
**Solution:**
- Check PAR URL hasn't expired
- Verify PAR has Read & Write permissions
- Ensure URL ends with `/o/`

### Files uploaded but not visible
**Solution:**
- Check Oracle Cloud Console → Object Storage → Your Bucket
- Files should appear under `uploads/` prefix
- Check MongoDB for upload metadata

## Next Steps

1. **Run pnpm install** - Install MongoDB package
2. **Setup .env** - Configure Oracle and MongoDB credentials
3. **Test upload flow** - Verify basic functionality works
4. **Update remaining routes** - Migrate other API endpoints as needed
5. **Implement auth** - Add JWT-based authentication
6. **Update worker** - Modify FFmpeg worker for Oracle storage

## Getting Credentials

### Oracle PAR URL
1. Oracle Cloud Console → Object Storage → Buckets
2. Select/create bucket
3. Pre-Authenticated Requests → Create
4. Set Read & Write access
5. Copy URL (include `/o/` at end)

### MongoDB URI
1. MongoDB Atlas → Connect
2. Connect your application
3. Copy connection string
4. Replace `<password>` with actual password

## Documentation

- **MIGRATION.md** - Complete migration guide with schemas and examples
- **MIGRATION_SUMMARY.md** - Quick reference and architecture overview
- **.env.example** - All required environment variables

## Support

If you encounter issues:
1. Check error messages in browser console
2. Check MongoDB Atlas logs
3. Check Oracle Cloud logs
4. Review MIGRATION.md troubleshooting section
5. Verify .env configuration

---

**Migration Status:** Core upload flow complete ✅
**Auth Status:** Temporarily disabled ⚠️
**Remaining Routes:** Need MongoDB migration 📝
