// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // Only initialise DevTools when the dev server is actually running.
  // Leaving this unconditionally true forces the devtools module to do its
  // full (~49 s) setup during `nuxt prepare` (postinstall), which is wasted
  // work and triggers bun's slow-postinstall warning.
  devtools: { enabled: process.env.NODE_ENV === 'development' },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/google-fonts',
    '@pinia/nuxt',
    '@nuxt/icon',
    '@nuxt/image',
    'nuxt-auth-utils',
  ],

  css: ['~/assets/css/main.css'],

  // Auto-import all components without folder-name prefixes (so app/components/layout/AppSidebar.vue
  // is referenced as <AppSidebar>, not <LayoutAppSidebar>).
  components: [
    { path: '~/components', pathPrefix: false },
  ],

  // Use locally-bundled iconify collections instead of fetching from api.iconify.design on every render.
  icon: {
    serverBundle: { collections: ['heroicons', 'simple-icons', 'lucide'] },
    clientBundle: { scan: true },
  },

  googleFonts: {
    families: {
      'Funnel Display': [300, 400, 500, 700, 800],
      Inter: [300, 400, 500, 600, 700, 800],
      Besley: {
        wght: [400, 500, 700],
        ital: [400],
      },
    },
    display: 'swap',
    download: true,   // bundle fonts locally (good for Vercel — no runtime CDN dependency)
    overwriting: false, // skip re-downloading if font files already exist on disk
  },

  tailwindcss: {
    configPath: '~/tailwind.config.ts',
  },

  // Runtime environment exposed to server routes (private) and the client (public).
  //
  // IMPORTANT — env-var naming: Nuxt's runtimeConfig auto-mapping looks for
  // `NUXT_<UPPER_SNAKE>` (e.g. `supabaseServiceRoleKey` → `NUXT_SUPABASE_SERVICE_ROLE_KEY`).
  // Our .env follows the upstream Supabase / Google convention WITHOUT the
  // `NUXT_` prefix (e.g. `SUPABASE_SERVICE_ROLE_KEY`), which means auto-mapping
  // does NOT pick those up — the runtimeConfig value silently stays at its
  // default empty string and `serviceSupabase()` throws `… service role key is
  // required` mid-OAuth, killing the session-cookie write before it happens.
  //
  // Fix: read the canonical env var names explicitly here. This way, both
  // `SUPABASE_SERVICE_ROLE_KEY=…` (current .env) and `NUXT_SUPABASE_SERVICE_ROLE_KEY=…`
  // (Nuxt auto-mapping override) work.
  runtimeConfig: {
    // server-only
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    glmApiKey: process.env.GLM_API_KEY || '',
    glmApiBaseUrl: process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    glmModel: process.env.GLM_MODEL || 'glm-4-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendFromEmail: process.env.RESEND_FROM_EMAIL || 'floo@example.com',
    storageBucketAssets: 'brand-assets',
    storageBucketAvatars: 'avatars',
    storageBucketAttachments: 'message-attachments',
    maxBrandAssetSizeMb: 50,
    maxAvatarSizeMb: 5,
    maxAttachmentSizeMb: 25,
    sessionSecret: '',                  // SESSION_SECRET (legacy slot — kept for back-compat)
    // nuxt-auth-utils reads these exact paths. We populate them from
    // process.env directly (rather than relying on the auto-resolved
    // NUXT_OAUTH_GOOGLE_* convention) so we can reuse the existing
    // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET env vars
    // without renaming anything.
    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
    },
    session: {
      password: process.env.SESSION_SECRET || '',
      // Explicit cookie config so the session cookie behaves correctly on
      // localhost. nuxt-auth-utils defaults are good but we make them explicit
      // here so any env-driven surprises are obvious.
      name: 'nuxt-session',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // secure must be FALSE on http://localhost — browsers refuse to
        // store Secure cookies on a non-HTTPS origin, which would silently
        // break the entire login flow in dev.
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
    // Stripe (Phase 7)
    stripeSecretKey: '',                // STRIPE_SECRET_KEY
    stripeWebhookSecret: '',            // STRIPE_WEBHOOK_SECRET
    stripePriceIdPro: '',               // STRIPE_PRICE_ID_PRO
    stripePriceIdTeam: '',              // STRIPE_PRICE_ID_TEAM
    public: {
      // exposed to the browser
      supabaseUrl: '',                  // NUXT_PUBLIC_SUPABASE_URL
      supabaseAnonKey: '',              // NUXT_PUBLIC_SUPABASE_ANON_KEY
      appUrl: 'http://localhost:3000',  // NUXT_PUBLIC_APP_URL
      storageCdnUrl: '',                // NUXT_PUBLIC_STORAGE_CDN_URL
      stripePublishableKey: '',         // NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    },
  },

  // Nuxt 3.12+ auto-sets srcDir to "app/" when an app/ directory exists,
  // making ~ resolve to app/ instead of the project root. Server files live
  // at <root>/server/, so we override ~ in Nitro to point to the root.
  nitro: {
    // Pin the deploy target to Vercel by default so `nuxt build` produces
    // .vercel/output/ both locally (for `vercel deploy --prebuilt`) and in
    // CI. Override with `NITRO_PRESET=node-server npm run build` for a
    // self-hosted node build.
    preset: process.env.NITRO_PRESET || 'vercel',
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },

  // On Vercel, route image optimization through Vercel's image CDN instead
  // of Nitro's IPX runtime — IPX would consume serverless function time on
  // every image request. Locally (NITRO_PRESET=node-server) IPX is fine.
  image: {
    provider: process.env.NITRO_PRESET === 'node-server' ? 'ipx' : 'vercel',
  },

  app: {
    head: {
      title: 'Floo·Content — Floothink Social Media Content',
      meta: [
        { name: 'description', content: 'AI-powered social media content management by Floothink' },
        { name: 'theme-color', content: '#5B479D' },
        { property: 'og:title', content: 'Floo·Content — Floothink' },
        { property: 'og:description', content: 'AI-powered social media content management by Floothink' },
        { property: 'og:image', content: '/og/og-image.png' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: '/og/og-image.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/images/floothink-app-icon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
