<template>
  <div class="flex flex-col h-full">
    <ProjectHeader />
    <ChatThread />
    <ChatComposer />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const userStore = useUserStore()

// Set active project from route
watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') {
      projectsStore.setActiveProject(id)
    }
  },
  { immediate: true },
)

// If the active project becomes null there are two distinct cases:
//
//   A) Initial load with wrong workspace (e.g. page reload, localStorage not
//      yet read, or direct URL visit). The project was never found this session.
//      → Attempt recovery: fetch the project from the API to discover its
//        workspaceId, switch workspace, reload projects, retry.
//
//   B) User intentionally switched workspace after the project was already
//      displayed. The project is simply no longer relevant.
//      → Redirect to `/` immediately (original behaviour).
//
// `initialLoadComplete` distinguishes the two: it flips true the first time
// the project is successfully resolved, so any subsequent null is case B.
let recovering = false
let initialLoadComplete = false

watch(
  () => projectsStore.activeProject,
  async (project) => {
    if (project) {
      recovering = false
      initialLoadComplete = true
      return
    }

    // Case B — project was already shown once; user switched workspace deliberately.
    if (initialLoadComplete) {
      router.replace('/')
      return
    }

    // Case A — project never found yet; may just be wrong workspace on load
    // (e.g. page reload before localStorage preference was applied).
    if (recovering) return
    if (!userStore.hydrated || userStore.usingMocks) return

    const id = route.params.id
    if (typeof id !== 'string') { router.replace('/'); return }

    recovering = true
    try {
      const row = await $fetch<{ workspace_id: string }>(`/api/projects/${id}`, {
        credentials: 'include',
      })
      const targetWs = userStore.workspaces.find((w) => w.id === row.workspace_id)
      if (!targetWs) { router.replace('/'); return }

      // Only switch workspace if it's genuinely different — calling
      // setActiveWorkspace with the same ID would still fire Vue watchers
      // (different object reference) and spuriously reset activeProjectId.
      if (userStore.activeWorkspace?.id !== targetWs.id) {
        userStore.setActiveWorkspace(targetWs)
      }
      await projectsStore.loadFromBackend(targetWs.id)
      projectsStore.setActiveProject(id)
      // If still null after recovery the project was deleted — redirect.
      if (!projectsStore.activeProject) router.replace('/')
    } catch {
      router.replace('/')
    } finally {
      recovering = false
    }
  },
  { immediate: true },  // Fire on mount so recovery starts even if activeProject is already null
)
</script>
