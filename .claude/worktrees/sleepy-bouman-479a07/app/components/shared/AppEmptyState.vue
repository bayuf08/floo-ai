<template>
  <div class="flex flex-col items-center justify-center text-center py-16 px-6">
    <div class="mb-4">
      <slot name="graphic">
        <FtComposition :size="120" />
      </slot>
    </div>
    <h2 class="font-display font-semibold text-xl text-floo-text mb-2">
      {{ title }}
    </h2>
    <p v-if="description" class="text-sm text-floo-text-secondary max-w-sm mb-6">
      {{ description }}
    </p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>
