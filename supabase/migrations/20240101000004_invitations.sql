-- ============================================================
-- Invitations — pending invites to workspaces or projects.
-- An invite is consumed (and marked accepted) when the recipient
-- clicks the magic link and is signed in via Google OAuth.
-- ============================================================

CREATE TABLE public.invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Random URL token. Looked up directly so we don't expose row UUIDs in URLs. */
  token         TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  /** Exactly one of workspace_id or project_id is set. */
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_target CHECK (
    (workspace_id IS NOT NULL AND project_id IS NULL)
    OR (workspace_id IS NULL AND project_id IS NOT NULL)
  )
);

CREATE INDEX idx_invitations_token   ON public.invitations(token);
CREATE INDEX idx_invitations_email   ON public.invitations(lower(email));
CREATE INDEX idx_invitations_pending ON public.invitations(accepted_at) WHERE accepted_at IS NULL;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- The inviter and any current member of the target workspace/project can SELECT.
CREATE POLICY invitations_select_members
  ON public.invitations FOR SELECT
  USING (
    invited_by = auth.uid()
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id))
    OR (project_id IS NOT NULL AND public.is_project_member(project_id))
  );

-- INSERT requires editor+ role on the target.
CREATE POLICY invitations_insert_editor
  ON public.invitations FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND (
      (workspace_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = invitations.workspace_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'editor')
      ))
      OR
      (project_id IS NOT NULL AND public.is_project_editor(project_id))
    )
  );

-- The inviter can revoke. Acceptance happens via the server endpoint
-- using the service-role client.
CREATE POLICY invitations_delete_inviter
  ON public.invitations FOR DELETE
  USING (invited_by = auth.uid());
