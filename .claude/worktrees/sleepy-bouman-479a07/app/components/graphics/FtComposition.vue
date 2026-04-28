<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="text-floo-brand opacity-90"
  >
    <!-- Soft tint background ring -->
    <circle cx="100" cy="100" r="90" fill="var(--brand-tint)" />

    <!-- Floothink double-loop motif: two interlocking rings -->
    <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">
      <circle cx="80" cy="100" r="36" />
      <circle cx="120" cy="100" r="36" />
    </g>

    <!-- Amber accent dot -->
    <circle cx="100" cy="100" r="6" fill="var(--cta)" />

    <!-- Decorative spokes -->
    <g stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4">
      <line x1="100" y1="20" x2="100" y2="40" />
      <line x1="100" y1="160" x2="100" y2="180" />
      <line x1="20" y1="100" x2="40" y2="100" />
      <line x1="160" y1="100" x2="180" y2="100" />
    </g>
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 160 }
)
</script>
