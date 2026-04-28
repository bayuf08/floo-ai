<template>
  <NuxtLayout>
    <NuxtPage :transition="{ name: 'fade', mode: 'out-in' }" />
  </NuxtLayout>
  <ToastContainer />
</template>

<script setup lang="ts">
import { useKeyboard } from '~/composables/useKeyboard'

// Wire global keyboard shortcuts (Esc, ⌘B, ⌘.)
useKeyboard()
</script>
