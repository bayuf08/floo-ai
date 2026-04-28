<template>
  <div class="animate-fade-in-up" :style="{ marginBottom: '36px' }">
    <!-- Assistant header -->
    <div
      class="flex items-center gap-2.5"
      :style="{ marginBottom: '14px', fontSize: '12px', color: 'var(--fg-3)', fontWeight: 500 }"
    >
      <span
        class="font-display flex items-center justify-center flex-shrink-0"
        :style="{
          width: '24px', height: '24px', borderRadius: '6px',
          background: 'var(--brand)', color: 'white',
          fontSize: '10px', fontWeight: 800, letterSpacing: '-0.02em',
        }"
      >F</span>
      <span>
        Floo
        <template v-if="message.modeLabel">
          · used <strong :style="{ color: 'var(--fg-2)', fontWeight: 600 }">{{ message.modeLabel }}</strong> mode with the project rules
        </template>
      </span>
    </div>

    <!-- Prelude (editorial italic) -->
    <p
      v-if="message.content"
      :style="{
        fontFamily: 'var(--font-editorial)',
        fontSize: '14.5px',
        color: 'var(--fg-2)',
        lineHeight: 1.65,
        marginBottom: '16px',
        maxWidth: '720px',
        whiteSpace: 'pre-wrap',
      }"
    >{{ message.content }}</p>

    <!-- Output cards -->
    <ChatOutputCard
      v-for="card in message.outputCards"
      :key="card.id"
      :card="card"
      :message-id="message.id"
    />
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '~/types/chat'

defineProps<{
  message: ChatMessage
}>()
</script>
