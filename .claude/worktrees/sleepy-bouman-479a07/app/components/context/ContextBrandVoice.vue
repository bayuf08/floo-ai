<template>
  <div>
    <h3 class="text-[11px] font-semibold tracking-wider text-floo-text-muted uppercase mb-2">
      Brand Voice
    </h3>

    <textarea
      v-if="editing"
      :value="content"
      @input="$emit('update', ($event.target as HTMLTextAreaElement).value)"
      rows="5"
      class="w-full text-[13px] leading-relaxed text-floo-text bg-floo-bg border border-purple-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-400 resize-none"
    />
    <p v-else class="text-[13px] leading-relaxed text-floo-text">
      {{ content }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  content: string
  editing: boolean
}>()

defineEmits<{
  update: [value: string]
}>()
</script>
