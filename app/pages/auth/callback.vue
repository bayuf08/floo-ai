<template>
  <div />
</template>

<script setup lang="ts">
/**
 * REMOVED — Google OAuth redirects to /api/auth/callback (server) now,
 * not /auth/callback (page). Anyone who lands here from a stale bookmark
 * or cached redirect gets bounced to the new entry point with their
 * query string intact.
 */
definePageMeta({ layout: false })
useHead({ title: 'Redirecting…' })

onMounted(() => {
  const search = window.location.search || ''
  window.location.replace(`/api/auth/callback${search}`)
})
</script>
