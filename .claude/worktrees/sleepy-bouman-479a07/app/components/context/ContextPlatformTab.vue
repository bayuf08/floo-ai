<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '14px' }">
    <!-- Profile section -->
    <section
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--r-md)',
        padding: '14px',
      }"
    >
      <header class="flex items-center" :style="{ gap: '10px', marginBottom: '12px' }">
        <span
          class="flex items-center justify-center"
          :style="{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'var(--platform-tint)',
            color: 'var(--platform)',
          }"
        >
          <Icon :name="platformMeta.icon" class="w-4 h-4" />
        </span>
        <div>
          <div class="font-display capitalize" :style="{ fontWeight: 700, fontSize: '14px' }">
            {{ platformMeta.label }}
          </div>
          <div :style="{ fontSize: '11px', color: 'var(--fg-3)' }">
            {{ followerLabel }}
          </div>
        </div>
        <span
          v-if="savedFlash"
          class="ml-auto inline-flex items-center"
          :style="{ gap: '4px', fontSize: '11.5px', color: 'var(--ft-green)', fontWeight: 600 }"
        >
          <Icon name="lucide:check" class="w-3 h-3" />
          Saved
        </span>
      </header>

      <div :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
        <div>
          <label :style="labelStyle" :for="`handle-${projectId}`">Handle</label>
          <input
            :id="`handle-${projectId}`"
            v-model="form.handle"
            type="text"
            placeholder="@yourbrand"
            :style="inputStyle"
          />
        </div>
        <div>
          <label :style="labelStyle" :for="`followers-${projectId}`">Follower count</label>
          <input
            :id="`followers-${projectId}`"
            v-model.number="form.followers"
            type="number"
            min="0"
            placeholder="0"
            :style="inputStyle"
          />
        </div>
        <div>
          <label :style="labelStyle" :for="`bio-${projectId}`">Bio</label>
          <textarea
            :id="`bio-${projectId}`"
            v-model="form.bio"
            rows="3"
            maxlength="150"
            placeholder="One-line description for the profile."
            :style="{ ...inputStyle, resize: 'none', fontFamily: 'var(--font-editorial)', lineHeight: 1.5 }"
          />
          <div :style="{ fontSize: '10.5px', color: 'var(--fg-3)', marginTop: '2px', textAlign: 'right' }">
            {{ form.bio.length }} / 150
          </div>
        </div>
        <button
          type="button"
          @click="save"
          :style="{
            alignSelf: 'flex-start',
            padding: '8px 14px',
            fontSize: '12.5px',
            fontWeight: 700,
            background: 'var(--cta)',
            color: 'var(--cta-fg)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-xs)',
          }"
        >
          Save profile
        </button>
      </div>
    </section>

    <!-- Reference section -->
    <section
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--r-md)',
        padding: '14px',
      }"
    >
      <h3
        class="font-display"
        :style="{
          fontWeight: 600,
          fontSize: '12px',
          color: 'var(--fg-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '10px',
        }"
      >
        Character limits
      </h3>
      <dl
        :style="{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          rowGap: '6px',
          columnGap: '12px',
          marginBottom: '14px',
        }"
      >
        <template v-for="(value, key) in platformMeta.limits" :key="key">
          <dt :style="{ fontSize: '12.5px', color: 'var(--fg-2)' }">{{ key }}</dt>
          <dd
            class="font-display"
            :style="{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }"
          >
            {{ value }}
          </dd>
        </template>
      </dl>

      <h3
        class="font-display"
        :style="{
          fontWeight: 600,
          fontSize: '12px',
          color: 'var(--fg-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '6px',
        }"
      >
        Optimal posting times
      </h3>
      <p
        :style="{
          fontFamily: 'var(--font-editorial)',
          fontSize: '13px',
          color: 'var(--fg-2)',
          lineHeight: 1.55,
          marginBottom: '10px',
        }"
      >
        {{ platformMeta.bestTimes }}
      </p>

      <p
        v-if="platformMeta.linkInBio"
        :style="{
          fontSize: '11.5px',
          color: 'var(--fg-3)',
          padding: '8px 10px',
          background: 'var(--bg-2)',
          borderRadius: 'var(--r-sm)',
          fontStyle: 'italic',
        }"
      >
        ⛓ No clickable links in posts — direct readers to the bio.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Platform, PlatformProfile } from '~/types/project'

const props = defineProps<{
  projectId: string
}>()

const projectsStore = useProjectsStore()

const project = computed(() => projectsStore.projects.find((p) => p.id === props.projectId) ?? null)
const platform = computed<Platform>(() => project.value?.platform ?? 'tiktok')
const existingProfile = computed(() => project.value?.contextRules?.platformProfile)

const form = reactive<PlatformProfile>({
  platform: platform.value,
  handle: existingProfile.value?.handle ?? '',
  followers: existingProfile.value?.followers ?? 0,
  bio: existingProfile.value?.bio ?? '',
})

watch(
  [platform, existingProfile],
  ([p, prof]) => {
    form.platform = p
    form.handle = prof?.handle ?? form.handle
    form.followers = prof?.followers ?? form.followers
    form.bio = prof?.bio ?? form.bio
  }
)

const savedFlash = ref(false)

function save() {
  projectsStore.updatePlatformProfile(props.projectId, {
    platform: form.platform,
    handle: form.handle.trim(),
    followers: Number(form.followers) || 0,
    bio: form.bio.trim().slice(0, 150),
  })
  savedFlash.value = true
  setTimeout(() => (savedFlash.value = false), 2000)
}

const followerLabel = computed(() => {
  const n = form.followers ?? 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K followers`
  return `${n} followers`
})

interface PlatformMeta {
  label: string
  icon: string
  limits: Record<string, string>
  bestTimes: string
  linkInBio: boolean
}

const platformData: Record<Platform, PlatformMeta> = {
  instagram: {
    label: 'Instagram',
    icon: 'simple-icons:instagram',
    limits: { Caption: '2,200', Bio: '150', 'Hashtags / post': '30', 'Story text': '250' },
    bestTimes: 'Tue–Thu, 11 AM – 1 PM and 7 – 9 PM local. Avoid Mondays before noon.',
    linkInBio: true,
  },
  tiktok: {
    label: 'TikTok',
    icon: 'simple-icons:tiktok',
    limits: { Caption: '2,200', Bio: '80', 'Hashtags / post': '5–8', 'Video length': '60s sweet' },
    bestTimes: 'Weekdays 6 – 10 PM. Wednesdays and Fridays show the best engagement lift.',
    linkInBio: true,
  },
  youtube: {
    label: 'YouTube',
    icon: 'simple-icons:youtube',
    limits: { Title: '100', Description: '5,000', Tags: '500', Thumbnail: '2 MB' },
    bestTimes: 'Thu–Sat, 2 – 4 PM. Avoid posting Mon mornings.',
    linkInBio: false,
  },
  twitter: {
    label: 'X',
    icon: 'simple-icons:x',
    limits: { Post: '280', Bio: '160', 'Thread length': 'unlimited', Media: '4 / post' },
    bestTimes: 'Weekdays 9 AM and 7 – 9 PM local. Threads do best at evening peak.',
    linkInBio: false,
  },
  threads: {
    label: 'Threads',
    icon: 'simple-icons:threads',
    limits: { Post: '500', Bio: '150', Replies: 'unlimited', Media: '10 / post' },
    bestTimes: 'Weekday mornings 8 – 10 AM. Reply within an hour to build the thread.',
    linkInBio: true,
  },
  linkedin: {
    label: 'LinkedIn',
    icon: 'simple-icons:linkedin',
    limits: { Post: '3,000', Headline: '220', 'Comments': '1,250', Document: '300 pages' },
    bestTimes: 'Tue–Thu, 8 – 10 AM and 12 – 1 PM. B2B audiences are heaviest mid-week.',
    linkInBio: false,
  },
}

const platformMeta = computed<PlatformMeta>(() => platformData[platform.value])

const labelStyle = {
  display: 'block',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  marginBottom: '4px',
}

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  fontSize: '13px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg)',
  outline: 'none',
}
</script>
