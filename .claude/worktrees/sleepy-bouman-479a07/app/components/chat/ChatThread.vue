<template>
  <div
    ref="threadRef"
    class="flex-1 overflow-y-auto custom-scrollbar"
    :style="{ padding: '24px 28px 8px' }"
  >
    <div :style="{ maxWidth: '820px', margin: '0 auto' }">
      <template v-for="message in chatStore.activeMessages" :key="message.id">
        <ChatMessageAI v-if="message.role === 'assistant'" :message="message" />
        <ChatMessageUser v-else :message="message" />
      </template>

      <!-- Thinking indicator -->
      <ChatThinkingIndicator v-if="chatStore.isThinking" />

      <!-- Scroll anchor -->
      <div ref="scrollAnchor" />
    </div>
  </div>
</template>

<script setup lang="ts">
const chatStore = useChatStore()
const threadRef = ref<HTMLElement>()
const scrollAnchor = ref<HTMLElement>()

function scrollToBottom() {
  nextTick(() => {
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(
  () => chatStore.activeMessages.length,
  () => scrollToBottom(),
)
watch(() => chatStore.isThinking, () => scrollToBottom())

onMounted(() => scrollToBottom())
</script>
