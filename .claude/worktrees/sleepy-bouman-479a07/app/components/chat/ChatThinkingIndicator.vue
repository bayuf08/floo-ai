<template>
  <div
    class="flex items-center gap-2"
    :style="{ color: 'var(--fg-3)', fontSize: '12.5px', padding: '4px 0 30px' }"
  >
    <span
      class="font-display flex items-center justify-center flex-shrink-0"
      :style="{
        width: '24px', height: '24px', borderRadius: '6px',
        background: 'var(--brand)', color: 'white',
        fontSize: '10px', fontWeight: 800, letterSpacing: '-0.02em',
      }"
    >F</span>
    <span :style="{ fontFamily: 'var(--font-editorial)', fontStyle: 'italic' }">Floo is thinking</span>
    <span class="inline-flex" :style="{ gap: '3px' }">
      <span
        v-for="i in 3"
        :key="i"
        :style="{
          width: '4px',
          height: '4px',
          borderRadius: '999px',
          background: 'var(--brand)',
          animation: `ftPulse 1.2s var(--ease-out) ${(i - 1) * 0.15}s infinite`,
          display: 'inline-block',
        }"
      />
    </span>
  </div>
</template>
