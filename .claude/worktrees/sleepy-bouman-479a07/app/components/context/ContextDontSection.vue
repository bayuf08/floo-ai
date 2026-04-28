<template>
  <div>
    <h3 class="text-[11px] font-semibold tracking-wider text-red-500 uppercase mb-2">
      DON'T
    </h3>

    <!-- Edit mode -->
    <div v-if="editing" class="space-y-2">
      <div v-for="(item, index) in items" :key="index" class="flex items-start gap-2">
        <textarea
          :value="item"
          @input="updateItem(index, ($event.target as HTMLTextAreaElement).value)"
          rows="2"
          class="flex-1 text-[13px] leading-relaxed text-floo-text bg-floo-bg border border-red-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 resize-none"
        />
      </div>
    </div>

    <!-- View mode -->
    <div v-else class="space-y-2">
      <p
        v-for="(item, index) in items"
        :key="index"
        class="text-[13px] leading-relaxed text-floo-text pl-3 border-l-2 border-red-300"
      >
        {{ item }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  items: string[]
  editing: boolean
}>()

const emit = defineEmits<{
  'update:items': [value: string[]]
}>()

function updateItem(index: number, value: string) {
  const updated = [...props.items]
  updated[index] = value
  emit('update:items', updated)
}
</script>
