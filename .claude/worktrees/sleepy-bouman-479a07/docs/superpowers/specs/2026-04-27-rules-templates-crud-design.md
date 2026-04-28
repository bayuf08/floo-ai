# Rules + Templates CRUD Design

Date: 2026-04-27
Status: Approved in chat, pending final spec review
Scope: First implementation slice of the broader Project Context CRUD effort

## Summary

Implement complete live CRUD for the `Rules` tab and reusable `rules templates` within Project Context, while preserving the current UI shape. This slice covers:

- Project-level Rules editing for `brand voice`, `DO`, `DON'T`, and `hashtags`
- Applying reusable templates to a project
- Workspace-scoped CRUD for custom rules templates
- Read-only handling for viewers and for built-in system templates

This slice intentionally does not redesign the panel and does not yet cover the other Project Context subsystems:

1. Knowledge
2. Saved
3. Skills verification / cleanup

## Product Decisions

- Use a dedicated frontend `rulesStore` rather than expanding `projectsStore`
- Keep project Rules editing as autosave, not explicit `Save / Cancel`
- Keep template management inside the existing `Import rules template` modal
- Treat template application as a one-time copy into the project
- Future edits to a template affect only future applies
- System templates are built-in and read-only
- Only workspace-created custom templates are editable and deletable
- `voice preview` is explicitly authored by the user

## Goals

- Connect the Rules tab to the live backend with rollback-safe autosave behavior
- Replace hardcoded template browsing with workspace-aware backend data
- Support create, read, update, delete, and apply flows for custom templates
- Enforce consistent project/workspace permissions across Rules and template actions
- Preserve mock/offline behavior for local development when backend calls are unavailable

## Non-Goals

- Redesigning the Project Context panel or tab structure
- Introducing explicit draft/save mode for live Rules editing
- Making applied templates stay linked to projects
- Adding version history or audit logs for Rules or templates
- Covering Knowledge, Saved, or additional Skills work in this slice

## Architecture

### Ownership Boundaries

`projectsStore` remains the owner of project entities, including `project.contextRules`.

A new `rulesStore` becomes the orchestration layer for everything in the `Rules` tab and `Import rules template` modal:

- load workspace templates
- expose permission checks for Rules and template actions
- patch project Rules fields
- apply templates to projects
- create custom templates
- edit custom templates
- delete custom templates
- coordinate optimistic updates and rollback

UI components become thin:

- `AppRightPanel.vue` renders Rules state and dispatches Rules actions
- `RulesTemplateModal.vue` renders the live template catalog and dispatches template actions
- The frontend `RULES_TEMPLATES` constant is demoted to offline/mock fallback only

### Why This Boundary

This keeps responsibilities clear:

- project state stays with projects
- reusable template catalog stays with rules
- components do not carry business logic

This also prevents `projectsStore` from becoming the catch-all owner for future `Knowledge` and `Saved` CRUD work.

## User Experience

### Rules Tab

The Rules tab keeps its current inline editing model:

- `brand voice` remains editable inline
- `DO` items remain add/edit/remove inline
- `DON'T` items remain add/edit/remove inline
- `hashtags` remain editable inline
- the `Import rules template` button remains in place

No new `Save` or `Cancel` actions are added for project Rules. Changes continue to autosave.

### Import Rules Template Modal

The existing modal becomes a dual-purpose surface:

- browse and apply templates
- manage workspace custom templates

The modal has two logical groups:

- `System templates`
  - always read-only
  - apply-only
- `Workspace templates`
  - live-loaded for the active workspace
  - editable and deletable only for workspace owners/editors

The modal also supports:

- creating a custom template
- editing a custom template
- deleting a custom template
- applying any allowed template to the current project

For template create/edit, the user explicitly authors:

- `name`
- `voice preview`
- `brand voice`
- `DO`
- `DON'T`
- `hashtags`

Template create/edit uses explicit save actions. Project Rules editing does not.

## Data Model Expectations

### Project Rules

The project continues to store live Rules in `project.contextRules`:

- `brandVoice`
- `doGuidelines`
- `dontGuidelines`
- `hashtags`

Applying a template overwrites those values in the project with copied values from the template.

### Rules Template

Frontend template rows should normalize backend fields into a single type, including:

- `id`
- `name`
- `voicePreview`
- `brandVoice`
- `doGuidelines`
- `dontGuidelines`
- `hashtags`
- `isSystem`
- `workspaceId`
- `createdAt`

System templates and workspace templates share one normalized shape. Permissions determine which actions appear.

## Frontend Flow

### Template Loading

`rulesStore` loads templates from:

- `GET /api/rules-templates?workspace=:workspaceId`

Loading should happen:

- when the active workspace changes
- when the modal opens and the active workspace catalog is not yet hydrated

Offline/mock mode may fall back to local template constants when backend loading fails.

### Project Rules Editing

The Rules tab calls store actions instead of mutating project state directly:

- `updateBrandVoice(projectId, value)`
- `updateDoGuidelines(projectId, items)`
- `updateDontGuidelines(projectId, items)`
- `updateHashtags(projectId, tags)`

Each action:

1. snapshots the previous project Rules value
2. updates the local project context immediately
3. sends `PATCH /api/projects/:id/context`
4. rolls back the local change on failure
5. shows a toast on failure

### Applying a Template

Applying a template calls a dedicated store action such as:

- `applyTemplate(projectId, templateId)`

That action:

1. confirms replacement in the modal
2. calls `POST /api/projects/:id/context/template`
3. updates the local project Rules from the chosen template or returned context
4. keeps the copied Rules only in the project
5. closes confirmation state on success

### Template CRUD

Template actions should live in `rulesStore`, for example:

- `createTemplate(input)`
- `updateTemplate(id, patch)`
- `deleteTemplate(id)`

Each action should:

- enforce permission checks before mutation
- update local template state optimistically where safe
- reconcile from backend response
- roll back on failure
- keep the modal open when a mutation fails

## Backend Integration

### Canonical Endpoints

Project Rules:

- `PATCH /api/projects/:id/context`
- `POST /api/projects/:id/context/template`

Rules templates:

- `GET /api/rules-templates?workspace=:workspaceId`
- `POST /api/rules-templates`
- `PATCH /api/rules-templates/:id`
- `DELETE /api/rules-templates/:id`

### Required Backend Behavior

Existing backend routes are treated as canonical and should be wired rather than replaced.

Key expected behaviors:

- project Rules patching requires project `editor` or `owner`
- applying a template requires project `editor` or `owner`
- custom template CRUD requires workspace `editor` or `owner`
- system templates cannot be edited or deleted
- applying a template is allowed only when:
  - the template is system-scoped, or
  - the template belongs to the same workspace as the project

## Permission Model

### Project Rules

- `owner` and `editor`: can edit live Rules and apply templates
- `viewer`: read-only

### Reusable Templates

- system templates: browse/apply only, never edit/delete
- workspace custom templates:
  - `owner` and `editor`: create, edit, delete, apply
  - `viewer`: browse only

The UI should hide or disable mutation affordances consistently, and the backend must remain authoritative.

## Failure Handling

### Project Rules Autosave Failure

On failure to patch project Rules:

- roll back only the affected local Rules value set
- show a concise toast such as `Couldn't save Rules changes`

### Template List Load Failure

If backend loading fails:

- use mock/local templates if the app is in offline mode
- otherwise show an inline error or empty state inside the modal
- do not leave the modal in a broken or blank-loading state forever

### Template Mutation Failure

On create/edit/delete failure:

- roll back optimistic local state
- keep the modal open
- preserve the user input when possible
- show a retry-friendly toast

### Template Apply Failure

On apply failure:

- leave the current project Rules unchanged
- keep the selected template and confirmation state available for retry

## Testing Strategy

### Frontend

- workspace template list refreshes correctly on workspace switch
- system templates render as locked
- workspace templates render with mutation controls only for permitted roles
- viewer cannot edit project Rules
- viewer cannot create/edit/delete templates
- project Rules autosave rolls back on failure
- template create/edit/delete rolls back on failure
- applying a template updates project Rules immediately
- editing a template later does not change projects that already applied it

### Backend

- template list returns system templates plus same-workspace custom templates
- cross-workspace custom templates are excluded from apply access
- system templates reject edit/delete attempts
- viewer-role users receive permission failures for Rules/template mutation routes
- project context patch route correctly persists `brand_voice`, `do_guidelines`, `dont_guidelines`, and `hashtags`

## Implementation Notes

- Prefer a focused `rulesStore` instead of expanding `projectsStore`
- Reuse existing toast patterns and optimistic rollback conventions already used in `Skills`
- Keep the current panel layout and modal entry point intact
- Preserve mock/offline mode for local UI development

## Future Slices

This spec covers only the first slice. The remaining work should be handled in separate spec and plan cycles:

1. `Knowledge` CRUD completion and hardening
2. `Saved` CRUD completion and hardening
3. `Skills` verification pass and final cleanup

## Acceptance Criteria

- Project Rules are fully live-backed and autosave safely with rollback
- Rules template browsing uses backend data for the active workspace
- Custom workspace templates support create, edit, delete, and apply
- System templates are visible but immutable
- Applying a template copies values into the current project only
- Later edits to a template do not retroactively change prior projects
- Viewer users are read-only across Rules and template management
- The current UI shape remains intact
