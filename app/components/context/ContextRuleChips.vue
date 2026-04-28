<template>
  <div>
    <div class="flex items-baseline justify-between mb-2">
      <h3 :class="['text-[11px] font-semibold tracking-wider uppercase', titleColorClass]">
        {{ title }}
      </h3>
      <span
        v-if="editing"
        class="text-[10.5px] tabular-nums text-floo-text-muted"
      >
        {{ items.length }} / {{ maxItems }}
      </span>
    </div>

    <!-- ── View mode — chip pills ──────────────────────────── -->
    <div
      v-if="!editing && items.length > 0"
      class="flex flex-wrap gap-1.5"
    >
      <span
        v-for="(item, index) in items"
        :key="`view-${index}`"
        :class="['inline-flex items-center text-[12px] leading-snug rounded-full px-2.5 py-1', chipColorClass]"
      >
        {{ item }}
      </span>
    </div>

    <!-- View mode — empty (mirrors brand voice empty hint) -->
    <p
      v-else-if="!editing"
      class="text-[12.5px] leading-relaxed text-floo-text-muted italic"
    >
      {{ emptyHint }}
    </p>

    <!-- ── Edit mode — chip pills + delete + inline edit ───── -->
    <div v-else class="space-y-2">
      <div v-if="items.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="(item, index) in items"
          :key="`edit-${index}-${index === editingIndex ? 'editing' : 'idle'}`"
          :class="[
            'inline-flex items-center text-[12px] leading-snug rounded-full',
            chipColorClass,
            'transition-colors',
          ]"
        >
          <!-- Inline editor — swap text for an input when this chip is being edited -->
          <input
            v-if="editingIndex === index"
            ref="editInput"
            :value="item"
            :maxlength="maxItemLength"
            @input="(e) => onInlineInput(index, (e.target as HTMLInputElement).value)"
            @keydown.enter.prevent="finishEdit"
            @keydown.esc.prevent="finishEdit"
            @blur="finishEdit"
            class="bg-transparent border-0 outline-none text-[12px] leading-snug px-2.5 py-1 min-w-[60px]"
            :style="{ width: `${Math.max(item.length, 6) + 2}ch` }"
          />
          <button
            v-else
            type="button"
            @click="startEdit(index)"
            class="px-2.5 py-1 cursor-text"
            :title="`${item} (click to edit)`"
          >
            {{ item }}
          </button>
          <button
            type="button"
            @click="removeItem(index)"
            :class="['flex items-center justify-center pr-2 -ml-1 transition-colors', removeBtnClass]"
            :aria-label="`Remove ${item}`"
          >
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </span>
      </div>

      <!-- New-item input -->
      <div v-if="items.length < maxItems" class="flex items-center gap-2">
        <input
          v-model="newItem"
          :placeholder="addPlaceholder"
          :maxlength="maxItemLength"
          @keydown.enter.prevent="commitNew"
          @keydown.,="onSeparator"
          @blur="commitNew"
          :class="[
            'flex-1 text-[12.5px] bg-floo-bg border rounded-full px-3 py-1.5 outline-none transition-colors',
            inputBorderClass,
          ]"
        />
        <button
          v-if="newItem.trim()"
          type="button"
          @click="commitNew"
          :class="['inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors', addBtnClass]"
          :aria-label="`Add ${title} rule`"
        >
          <Icon name="lucide:plus" class="w-3.5 h-3.5" />
        </button>
      </div>
      <p
        v-else
        class="text-[10.5px] text-floo-text-muted italic"
      >
        Reached the {{ maxItems }}-rule cap. Remove one to add another.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Shared chip-list editor for DO / DON'T rule sets.
 *
 * - View mode: pills laid out with flex-wrap.
 * - Edit mode: same pills, click to edit inline, × to remove, input + Enter
 *   (or comma) to add. Hard caps at 100 chars per chip and 10 chips per list.
 *
 * Colour tokens are passed in via props so the same component renders in
 * green for DO and red for DON'T — no duplicated template logic.
 */

interface Props {
  items: string[]
  editing: boolean
  title: string
  /** Tailwind class for the section title color (e.g. 'text-green-600'). */
  titleColorClass: string
  /** Tailwind classes for the chip pill background + border + text. */
  chipColorClass: string
  /** Tailwind classes for the input border (focus state included). */
  inputBorderClass: string
  /** Tailwind classes for the add (+) button. */
  addBtnClass: string
  /** Tailwind classes for the × remove button. */
  removeBtnClass: string
  addPlaceholder?: string
  emptyHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  addPlaceholder: 'Add a rule…',
  emptyHint: 'No rules yet. Click Edit to add some.',
})

const emit = defineEmits<{
  'update:items': [value: string[]]
}>()

const maxItems = 10
const maxItemLength = 100

const newItem = ref('')
const editingIndex = ref<number | null>(null)
const editInput = ref<HTMLInputElement[]>()

function commitNew() {
  const trimmed = newItem.value.trim()
  if (!trimmed) return
  if (props.items.length >= maxItems) return
  if (props.items.includes(trimmed)) {
    // Quietly ignore exact duplicates so users don't accumulate noise.
    newItem.value = ''
    return
  }
  emit('update:items', [...props.items, trimmed.slice(0, maxItemLength)])
  newItem.value = ''
}

/** Comma can act as a separator — common pattern for tag inputs. */
function onSeparator(e: KeyboardEvent) {
  e.preventDefault()
  commitNew()
}

function removeItem(index: number) {
  const next = [...props.items]
  next.splice(index, 1)
  emit('update:items', next)
}

function startEdit(index: number) {
  editingIndex.value = index
  // Focus the new input on next tick — it gets rendered by v-if above.
  nextTick(() => {
    editInput.value?.[0]?.focus()
    editInput.value?.[0]?.select()
  })
}

function onInlineInput(index: number, value: string) {
  const next = [...props.items]
  next[index] = value.slice(0, maxItemLength)
  emit('update:items', next)
}

function finishEdit() {
  if (editingIndex.value === null) return
  const idx = editingIndex.value
  const cleaned = (props.items[idx] ?? '').trim()
  editingIndex.value = null
  if (!cleaned) {
    // Empty after trim → drop the chip entirely. Avoids leaving phantom blanks.
    removeItem(idx)
    return
  }
  if (cleaned !== props.items[idx]) {
    const next = [...props.items]
    next[idx] = cleaned
    emit('update:items', next)
  }
}
</script>
