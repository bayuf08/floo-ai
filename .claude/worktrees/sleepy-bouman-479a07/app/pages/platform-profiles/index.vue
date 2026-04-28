<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Page header -->
    <header
      class="flex-shrink-0"
      :style="{
        padding: '28px 40px 18px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg)',
      }"
    >
      <div class="flex items-start justify-between">
        <div>
          <h1
            class="font-display"
            :style="{
              fontWeight: 700,
              fontSize: '24px',
              letterSpacing: '-0.015em',
              color: 'var(--fg)',
              marginBottom: '4px',
            }"
          >
            Platform profiles
          </h1>
          <p :style="{ fontSize: '13.5px', color: 'var(--fg-2)', maxWidth: '640px' }">
            Reference cards for each platform — default tone, character limits, and content tips
            Floo applies when you write for them.
          </p>
        </div>
      </div>
    </header>

    <!-- Grid -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" :style="{ padding: '24px 40px 40px' }">
      <div
        class="grid"
        :style="{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }"
      >
        <article
          v-for="p in platforms"
          :key="p.value"
          :style="cardStyle"
        >
          <!-- Card header -->
          <div
            class="flex items-center"
            :style="{ padding: '16px 18px', borderBottom: '1px solid var(--border-soft)', gap: '12px' }"
          >
            <span
              class="flex items-center justify-center"
              :style="{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--r-md)',
                background: p.tint,
                color: p.color,
              }"
            >
              <Icon :name="p.icon" class="w-5 h-5" />
            </span>
            <div>
              <div
                class="font-display"
                :style="{ fontWeight: 700, fontSize: '15px', color: 'var(--fg)' }"
              >
                {{ p.label }}
              </div>
              <div :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500 }">
                {{ p.handle }}
              </div>
            </div>
          </div>

          <!-- Default tone -->
          <div :style="sectionStyle">
            <div :style="sectionLabelStyle">Default tone</div>
            <p
              :style="{
                fontFamily: 'var(--font-editorial)',
                fontSize: '13.5px',
                color: 'var(--fg)',
                lineHeight: 1.55,
              }"
            >
              {{ p.tone }}
            </p>
          </div>

          <!-- Character limits -->
          <div :style="sectionStyle">
            <div :style="sectionLabelStyle">Character limits</div>
            <dl :style="{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '4px', columnGap: '12px' }">
              <template v-for="(value, key) in p.limits" :key="key">
                <dt :style="{ fontSize: '12.5px', color: 'var(--fg-2)' }">{{ key }}</dt>
                <dd
                  class="font-display"
                  :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', tabularNums: 'true' }"
                >
                  {{ value }}
                </dd>
              </template>
            </dl>
          </div>

          <!-- Content tips -->
          <div :style="{ ...sectionStyle, borderBottom: 'none' }">
            <div :style="sectionLabelStyle">Content tips</div>
            <ul
              :style="{
                margin: 0,
                paddingLeft: '18px',
                fontFamily: 'var(--font-editorial)',
                fontSize: '13px',
                color: 'var(--fg-2)',
                lineHeight: 1.55,
              }"
            >
              <li v-for="(tip, i) in p.tips" :key="i" :style="{ marginBottom: '4px' }">
                {{ tip }}
              </li>
            </ul>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Platform profiles · Floo·Content' })

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  overflow: 'hidden',
  boxShadow: 'var(--shadow-xs)',
}

const sectionStyle = {
  padding: '14px 18px',
  borderBottom: '1px solid var(--border-soft)',
}

const sectionLabelStyle = {
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--fg-3)',
  marginBottom: '6px',
}

const platforms = [
  {
    value: 'instagram',
    label: 'Instagram',
    icon: 'simple-icons:instagram',
    color: '#E1306C',
    tint: 'color-mix(in srgb, #E1306C 14%, transparent)',
    handle: '@kayu.studio',
    tone: 'Visual-first, considered captions. The first 125 characters carry the post — anything after is for the loyal reader.',
    limits: { Caption: '2,200', Bio: '150', 'Hashtags / post': '30' },
    tips: [
      'Hashtags belong at the end, not inline.',
      'No external links — direct readers to the bio.',
      'Carousel posts outperform single images for craft brands.',
    ],
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    icon: 'simple-icons:tiktok',
    color: '#E8645A',
    tint: 'color-mix(in srgb, #E8645A 14%, transparent)',
    handle: '@kayu.studio',
    tone: 'Hook-first, pacey, audio-driven. Lead with the most arresting visual moment in the first 1.5 seconds.',
    limits: { Caption: '2,200', Bio: '80', 'Hashtags / post': '5–8' },
    tips: [
      'Match audio to mood — silence reads as intentional only when paced right.',
      'Captions are read in motion; under 80 characters is safest.',
      'Native text overlays beat caption-only posts for save rate.',
    ],
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: 'simple-icons:youtube',
    color: '#C73B3B',
    tint: 'color-mix(in srgb, #C73B3B 14%, transparent)',
    handle: '@kayu.studio',
    tone: 'Editorial, considered, generous with context. Long-form viewers come for depth — give it.',
    limits: { Title: '100', Description: '5,000', Tags: '500' },
    tips: [
      'First two lines of description are visible above the fold — load them with searchable terms.',
      'Chapters with clear timestamps lift average watch time.',
      'Pin a comment that sets the conversation — viewers anchor to it.',
    ],
  },
  {
    value: 'x',
    label: 'X (Twitter)',
    icon: 'simple-icons:x',
    color: '#4B70B6',
    tint: 'color-mix(in srgb, #4B70B6 14%, transparent)',
    handle: '@kayu.studio',
    tone: 'Direct, opinionated, replyable. A post that earns no replies is shouting into a vacuum.',
    limits: { Post: '280', Bio: '160', 'Thread length': 'unlimited' },
    tips: [
      'Threads outperform single posts when the first tweet promises a payoff.',
      'Reply guys come for spicy takes; loyal readers come for craft notes.',
      'Images and short video lift engagement 2–3× vs. text-only.',
    ],
  },
  {
    value: 'threads',
    label: 'Threads',
    icon: 'simple-icons:threads',
    color: '#1B1726',
    tint: 'color-mix(in srgb, #1B1726 10%, transparent)',
    handle: '@kayu.studio',
    tone: 'Conversational, longer than X but less polished than IG captions. Good for behind-the-scenes notes.',
    limits: { Post: '500', Bio: '150', 'Replies': 'unlimited' },
    tips: [
      'No hashtags — the algorithm rewards genuine conversation.',
      'Cross-posting from IG works, but native posts get more reach.',
      'Reply within an hour of posting — early replies build the thread.',
    ],
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    icon: 'simple-icons:linkedin',
    color: '#0A66C2',
    tint: 'color-mix(in srgb, #0A66C2 14%, transparent)',
    handle: 'kayu-studio',
    tone: 'Professional, story-led, generous with framing. The first three lines decide whether anyone clicks "see more".',
    limits: { Post: '3,000', Headline: '220', 'Comments': '1,250' },
    tips: [
      'Use line breaks generously — dense text gets scrolled past.',
      'Native PDF carousels outperform link posts for reach.',
      'Tag people sparingly and meaningfully — over-tagging gets demoted.',
    ],
  },
] as const
</script>
