# Quick Start - AutoCapsPersonal with MongoDB + Oracle Storage

## 1️⃣ Install Dependencies
```bash
cd AutoCapsPersonal
pnpm install
```

## 2️⃣ Setup Environment
Create `.env` file:
```env
# Oracle Object Storage PAR URL
ORACLE_PAR_URL=https://objectstorage.ap-mumbai-1.oraclecloud.com/p/YOUR_TOKEN/n/NAMESPACE/b/BUCKET/o/
NEXT_PUBLIC_ORACLE_PAR_URL=https://objectstorage.ap-mumbai-1.oraclecloud.com/p/YOUR_TOKEN/n/NAMESPACE/b/BUCKET/o/

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=autocaps

# Optional Services
ASSEMBLYAI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
FILE_RETENTION_DAYS=7
```

## 3️⃣ Run Development Server
```bash
pnpm dev
```

Open: http://localhost:3000

## ✅ What's Working
- ✅ Upload videos to Oracle Object Storage
- ✅ Store metadata in MongoDB
- ✅ Direct PUT/GET file operations
- ✅ Single bucket architecture

## ⚠️ What Needs Work
- ⚠️ Authentication (currently disabled)
- ⚠️ Transcription API (needs MongoDB update)
- ⚠️ Render API (needs MongoDB update)
- ⚠️ Other API routes (still use Supabase stubs)

## 📝 Key Files
- `lib/mongodb.ts` - Database connection
- `lib/oracle-storage.ts` - File storage helpers
- `app/api/videos/upload/route.ts` - Upload endpoint
- `.env.example` - Configuration template

## 🔗 Documentation
- **SETUP.md** - Detailed setup instructions
- **MIGRATION.md** - Complete migration guide
- **MIGRATION_SUMMARY.md** - Architecture overview

## 🚀 Test Upload
1. Navigate to `/dashboard/upload`
2. Select a video file
3. Fill in title
4. Click "Upload & Process"
5. Check Oracle bucket for file
6. Check MongoDB for metadata

## 🆘 Need Help?
See MIGRATION.md "Troubleshooting" section
