<template>
  <span
    class="inline-flex items-center gap-1 rounded-full font-semibold"
    :class="sizeClasses"
    :style="{ background: config.bgColor, color: config.color }"
  >
    <Icon :name="platformIcon" :class="iconSize" />
    {{ config.label }}
  </span>
</template>

<script setup lang="ts">
import { PLATFORM_CONFIG, type Platform } from '~/types/project'

const props = withDefaults(
  defineProps<{
    platform: Platform
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' }
)

const config = computed(() => PLATFORM_CONFIG[props.platform])

const sizeClasses = computed(() =>
  props.size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-2.5 py-1 text-[11px]'
)

const iconSize = computed(() =>
  props.size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
)

const platformIcon = computed(() => {
  const icons: Record<Platform, string> = {
    tiktok: 'simple-icons:tiktok',
    instagram: 'simple-icons:instagram',
    twitter: 'simple-icons:x',
    youtube: 'simple-icons:youtube',
    linkedin: 'simple-icons:linkedin',
    threads: 'simple-icons:threads',
  }
  return icons[props.platform]
})
</script>
