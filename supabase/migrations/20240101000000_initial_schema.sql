-- ============================================================
-- Floo·Content — Initial Schema
-- Mirrors supabase/schema.dbml. Apply via `supabase db push`.
-- ============================================================

-- pgcrypto provides gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. PROFILES (extends auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT DEFAULT 'member',
  avatar_url  TEXT,
  initials    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Auto-create a profile row on every auth.users insert (Google OAuth).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    -- Take first letter of each word, max 2
    UPPER(SUBSTRING(
      regexp_replace(
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        '([A-Za-z])[A-Za-z]+\s*',
        '\1',
        'g'
      ),
      1, 2
    ))
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. WORKSPACES
-- ============================================
CREATE TABLE public.workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  type              TEXT DEFAULT 'general',
  color             TEXT DEFAULT '#5B479D',
  description       TEXT,
  default_platform  TEXT DEFAULT 'tiktok',
  owner_id          UUID NOT NULL REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- Owner is automatically a member with role 'owner'.
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- ============================================
-- 3. PROJECTS
-- ============================================
CREATE TABLE public.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'tiktok',
  color         TEXT DEFAULT '#4B70B6',
  is_pinned     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. PROJECT_CONTEXTS (1:1 with projects)
-- ============================================
CREATE TABLE public.project_contexts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID UNIQUE NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  brand_voice         TEXT DEFAULT '',
  do_guidelines       TEXT[] DEFAULT '{}',
  dont_guidelines     TEXT[] DEFAULT '{}',
  hashtags            TEXT[] DEFAULT '{}',
  platform_handle     TEXT,
  platform_bio        TEXT,
  platform_followers  INTEGER,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Auto-create empty context row on project insert.
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_contexts (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

-- ============================================
-- 5. PROJECT_MEMBERS
-- ============================================
CREATE TABLE public.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ============================================
-- 6. BRAND_ASSETS
-- ============================================
CREATE TABLE public.brand_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('image','video','document','presentation','spreadsheet','other')),
  extension     TEXT NOT NULL,
  description   TEXT DEFAULT '',
  storage_path  TEXT NOT NULL,
  preview_url   TEXT,
  uploaded_by   UUID REFERENCES public.profiles(id),
  uploaded_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7. SKILLS + project_skills
-- ============================================
CREATE TABLE public.skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('voice','format','trend','workflow')),
  description   TEXT DEFAULT '',
  instructions  TEXT,
  examples      TEXT,
  is_custom     BOOLEAN DEFAULT false,
  created_by    UUID REFERENCES public.profiles(id),
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.project_skills (
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id    UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  active      BOOLEAN DEFAULT true,
  PRIMARY KEY (project_id, skill_id)
);

-- ============================================
-- 8. CHAT_MESSAGES + output_cards
-- ============================================
CREATE TABLE public.chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content      TEXT NOT NULL,
  mode_label   TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.output_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  label       TEXT,
  sub         TEXT,
  accent      TEXT,
  can_copy    BOOLEAN DEFAULT true,
  items       TEXT[] NOT NULL DEFAULT '{}'
);

-- ============================================
-- 9. SAVED_OUTPUTS
-- ============================================
CREATE TABLE public.saved_outputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sub         TEXT,
  accent      TEXT,
  items       TEXT[] NOT NULL DEFAULT '{}',
  saved_by    UUID REFERENCES public.profiles(id),
  saved_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 10. RULES_TEMPLATES
-- ============================================
CREATE TABLE public.rules_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  voice_preview   TEXT,
  brand_voice     TEXT,
  do_guidelines   TEXT[] DEFAULT '{}',
  dont_guidelines TEXT[] DEFAULT '{}',
  hashtags        TEXT[] DEFAULT '{}',
  is_system       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_projects_workspace          ON public.projects(workspace_id);
CREATE INDEX idx_chat_messages_project       ON public.chat_messages(project_id, created_at DESC);
CREATE INDEX idx_brand_assets_project        ON public.brand_assets(project_id);
CREATE INDEX idx_project_skills_project      ON public.project_skills(project_id);
CREATE INDEX idx_workspace_members_user      ON public.workspace_members(user_id);
CREATE INDEX idx_project_members_project     ON public.project_members(project_id);
CREATE INDEX idx_saved_outputs_project       ON public.saved_outputs(project_id);
CREATE INDEX idx_skills_workspace            ON public.skills(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_rules_templates_workspace   ON public.rules_templates(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================
-- updated_at triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at        BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workspaces_updated_at      BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_projects_updated_at        BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_project_contexts_updated_at BEFORE UPDATE ON public.project_contexts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
