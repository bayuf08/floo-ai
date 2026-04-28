-- ============================================================
-- Row Level Security policies
-- Apply after 20240101000000_initial_schema.sql
-- ============================================================

-- ─── Helpers ─────────────────────────────────────────────────
-- Returns true if the current authenticated user is a member of the given workspace.
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = auth.uid()
  );
$$;

-- Returns true if the current user is workspace owner.
CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- Returns true if the current user is a member of the project's workspace.
CREATE OR REPLACE FUNCTION public.is_project_member(proj UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = proj AND wm.user_id = auth.uid()
  );
$$;

-- Returns true if the current user is workspace member with editor or owner role.
CREATE OR REPLACE FUNCTION public.is_project_editor(proj UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = proj AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'editor')
  );
$$;

-- ─── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self_or_workspace
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members me
      JOIN public.workspace_members them ON them.workspace_id = me.workspace_id
      WHERE me.user_id = auth.uid() AND them.user_id = profiles.id
    )
  );

CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT happens via the on_auth_user_created trigger (SECURITY DEFINER), no policy needed for end-users

-- ─── workspaces ──────────────────────────────────────────────
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_select_member
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id));

CREATE POLICY workspaces_insert_authenticated
  ON public.workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY workspaces_update_owner
  ON public.workspaces FOR UPDATE
  USING (public.is_workspace_owner(id))
  WITH CHECK (public.is_workspace_owner(id));

CREATE POLICY workspaces_delete_owner
  ON public.workspaces FOR DELETE
  USING (public.is_workspace_owner(id));

-- ─── workspace_members ──────────────────────────────────────
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_members_select
  ON public.workspace_members FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY workspace_members_insert_owner
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    public.is_workspace_owner(workspace_id)
    -- Owners always seed their own membership via the on_workspace_created trigger
    OR (user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY workspace_members_update_owner
  ON public.workspace_members FOR UPDATE
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

CREATE POLICY workspace_members_delete_owner
  ON public.workspace_members FOR DELETE
  USING (
    public.is_workspace_owner(workspace_id)
    OR user_id = auth.uid()  -- members can leave a workspace themselves
  );

-- ─── projects ────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_member
  ON public.projects FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY projects_insert_editor
  ON public.projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = projects.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY projects_update_editor
  ON public.projects FOR UPDATE
  USING (public.is_project_editor(id))
  WITH CHECK (public.is_project_editor(id));

CREATE POLICY projects_delete_editor
  ON public.projects FOR DELETE
  USING (public.is_project_editor(id));

-- ─── project_contexts ────────────────────────────────────────
ALTER TABLE public.project_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_contexts_select_member
  ON public.project_contexts FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY project_contexts_modify_editor
  ON public.project_contexts FOR ALL
  USING (public.is_project_editor(project_id))
  WITH CHECK (public.is_project_editor(project_id));

-- ─── project_members ─────────────────────────────────────────
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_members_select
  ON public.project_members FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY project_members_modify_editor
  ON public.project_members FOR ALL
  USING (public.is_project_editor(project_id))
  WITH CHECK (public.is_project_editor(project_id));

-- ─── brand_assets ────────────────────────────────────────────
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_assets_select_member
  ON public.brand_assets FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY brand_assets_insert_editor
  ON public.brand_assets FOR INSERT
  WITH CHECK (public.is_project_editor(project_id));

CREATE POLICY brand_assets_update_editor
  ON public.brand_assets FOR UPDATE
  USING (public.is_project_editor(project_id))
  WITH CHECK (public.is_project_editor(project_id));

CREATE POLICY brand_assets_delete_editor
  ON public.brand_assets FOR DELETE
  USING (public.is_project_editor(project_id));

-- ─── skills (system + custom) ────────────────────────────────
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY skills_select_system_or_workspace
  ON public.skills FOR SELECT
  USING (
    workspace_id IS NULL
    OR public.is_workspace_member(workspace_id)
  );

CREATE POLICY skills_insert_workspace_editor
  ON public.skills FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = skills.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY skills_update_workspace_editor
  ON public.skills FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = skills.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY skills_delete_workspace_editor
  ON public.skills FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = skills.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

-- ─── project_skills ──────────────────────────────────────────
ALTER TABLE public.project_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_skills_select_member
  ON public.project_skills FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY project_skills_modify_editor
  ON public.project_skills FOR ALL
  USING (public.is_project_editor(project_id))
  WITH CHECK (public.is_project_editor(project_id));

-- ─── chat_messages ───────────────────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_select_member
  ON public.chat_messages FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY chat_messages_insert_editor
  ON public.chat_messages FOR INSERT
  WITH CHECK (public.is_project_editor(project_id));

CREATE POLICY chat_messages_delete_editor
  ON public.chat_messages FOR DELETE
  USING (public.is_project_editor(project_id));

-- ─── output_cards (joined to messages) ───────────────────────
ALTER TABLE public.output_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY output_cards_select_member
  ON public.output_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      WHERE cm.id = output_cards.message_id
        AND public.is_project_member(cm.project_id)
    )
  );

CREATE POLICY output_cards_insert_editor
  ON public.output_cards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      WHERE cm.id = output_cards.message_id
        AND public.is_project_editor(cm.project_id)
    )
  );

-- ─── saved_outputs ───────────────────────────────────────────
ALTER TABLE public.saved_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_outputs_select_member
  ON public.saved_outputs FOR SELECT
  USING (public.is_project_member(project_id));

CREATE POLICY saved_outputs_modify_editor
  ON public.saved_outputs FOR ALL
  USING (public.is_project_editor(project_id))
  WITH CHECK (public.is_project_editor(project_id));

-- ─── rules_templates (system + workspace) ───────────────────
ALTER TABLE public.rules_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY rules_templates_select_system_or_workspace
  ON public.rules_templates FOR SELECT
  USING (
    is_system = true
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id))
  );

CREATE POLICY rules_templates_modify_workspace_editor
  ON public.rules_templates FOR ALL
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = rules_templates.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = rules_templates.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );
