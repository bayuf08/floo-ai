<template>
  <div class="flex flex-col items-end animate-fade-in-up" :style="{ marginBottom: '28px' }">
    <div
      :style="{
        maxWidth: '78%',
        background: 'var(--brand-tint)',
        color: 'var(--fg)',
        padding: '14px 18px',
        borderRadius: '16px 16px 4px 16px',
        fontSize: '14px',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
      }"
    >
      {{ message.content }}
    </div>
    <div
      :style="{
        fontSize: '11px',
        color: 'var(--fg-3)',
        marginTop: '6px',
        marginRight: '4px',
        fontWeight: 500,
      }"
    >
      You · {{ formatTime(message.timestamp) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '~/types/chat'

defineProps<{
  message: ChatMessage
}>()

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
</script>
