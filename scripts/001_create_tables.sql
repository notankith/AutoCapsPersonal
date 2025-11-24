CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles keep Supabase Auth metadata handy for dashboard personalization
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
  CREATE TYPE public.upload_status AS ENUM (
    'pending_upload',
    'uploaded',
    'transcribed',
    'translated',
    'rendering',
    'rendered',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.job_type AS ENUM ('transcription', 'translation', 'render');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.job_status AS ENUM ('queued', 'processing', 'done', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.uploads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  duration_seconds DOUBLE PRECISION,
  status public.upload_status NOT NULL DEFAULT 'pending_upload',
  metadata JSONB,
  caption_asset_path TEXT,
  render_asset_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE TABLE IF NOT EXISTS public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_language TEXT,
  model TEXT,
  text TEXT NOT NULL,
  segments JSONB NOT NULL,
  words JSONB,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  model TEXT,
  text TEXT NOT NULL,
  segments JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.job_type NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS latest_transcript_id UUID,
  ADD COLUMN IF NOT EXISTS latest_translation_id UUID;

ALTER TABLE public.uploads
  ADD CONSTRAINT uploads_latest_transcript_fk FOREIGN KEY (latest_transcript_id) REFERENCES public.transcripts(id) ON DELETE SET NULL;

ALTER TABLE public.uploads
  ADD CONSTRAINT uploads_latest_translation_fk FOREIGN KEY (latest_translation_id) REFERENCES public.translations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER uploads_set_updated_at BEFORE UPDATE ON public.uploads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "uploads_select_own" ON public.uploads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uploads_insert_own" ON public.uploads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uploads_update_own" ON public.uploads FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transcripts_select_own" ON public.transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transcripts_insert_own" ON public.transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "translations_select_own" ON public.translations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "translations_insert_own" ON public.translations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "jobs_select_own" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jobs_insert_own" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_update_own" ON public.jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
