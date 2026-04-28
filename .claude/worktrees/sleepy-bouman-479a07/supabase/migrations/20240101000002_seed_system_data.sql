-- ============================================================
-- Seed system data: 24 system skills + 4 system rules templates.
-- These rows have workspace_id = NULL and are visible to every workspace.
-- ============================================================

-- ─── 24 SYSTEM SKILLS ────────────────────────────────────────
INSERT INTO public.skills (name, category, description, is_custom, workspace_id) VALUES
  -- Voice (6)
  ('Quiet Artisan',     'voice',    'Short Indonesian sentences, weight-bearing. No hype words.', false, NULL),
  ('Hype Mode',         'voice',    'High-energy, exclamation-heavy, leans into trending phrases.', false, NULL),
  ('Indo-English Mix',  'voice',    'Code-switches between Bahasa and English where each lands harder.', false, NULL),
  ('Editorial',         'voice',    'Long-form, considered, magazine-feature register.', false, NULL),
  ('Conversational',    'voice',    'Like talking to a friend over coffee. Contractions, asides.', false, NULL),
  ('Provocateur',       'voice',    'Pointed, contrarian openers designed to spark replies.', false, NULL),

  -- Format (6)
  ('Numbered Hooks',    'format',   '5–7 hook variations as a numbered list, ranked by stopping power.', false, NULL),
  ('Carousel Outline',  'format',   'Slide-by-slide outline with cover, body slides, and CTA.', false, NULL),
  ('Short Caption',     'format',   'Under 100 characters. One line, no hashtags inline.', false, NULL),
  ('Long Caption',      'format',   '3–5 short paragraphs with line breaks for scannability.', false, NULL),
  ('Thread Builder',    'format',   'Twitter/X thread with numbered tweets and a strong opener.', false, NULL),
  ('Script Beats',      'format',   'Hook, build, payoff, CTA — beats for short-form video.', false, NULL),

  -- Trend (6)
  ('Audio Trend Match',   'trend',  'Suggests trending audio that fits the brand voice.', false, NULL),
  ('Visual Trend Match',  'trend',  'Identifies visual treatments currently performing in the niche.', false, NULL),
  ('Cultural Moment',     'trend',  'Connects content to a current cultural conversation.', false, NULL),
  ('Seasonal Anchor',     'trend',  'Anchors the post to a calendar moment (holiday, weather, ritual).', false, NULL),
  ('Niche Reference',     'trend',  'Drops references that signal in-group fluency to the audience.', false, NULL),
  ('Counter-Trend',       'trend',  'Deliberately positions against the current trend for contrast.', false, NULL),

  -- Workflow (6)
  ('Brief Summarizer',         'workflow', 'Distills a long brief into a 3-line creative direction.', false, NULL),
  ('Concept Variations',       'workflow', 'Generates 3 distinct creative angles from one starting concept.', false, NULL),
  ('Hashtag Researcher',       'workflow', 'Suggests platform-appropriate hashtags by reach band.', false, NULL),
  ('Posting Time Suggester',   'workflow', 'Recommends post timing based on platform + audience timezone.', false, NULL),
  ('Cross-Platform Adapter',   'workflow', 'Rewrites one piece of content for 3 platforms preserving voice.', false, NULL),
  ('Performance Recap',        'workflow', 'Summarizes which patterns drove engagement in the last cycle.', false, NULL);

-- ─── 4 SYSTEM RULES TEMPLATES ───────────────────────────────
INSERT INTO public.rules_templates
  (workspace_id, name, voice_preview, brand_voice, do_guidelines, dont_guidelines, hashtags, is_system)
VALUES
  (
    NULL,
    'Quiet Artisan',
    'Deliberate, weight-bearing. Short sentences. No hype words.',
    'Quiet, deliberate, weight-bearing. Short sentences. No exclamation marks, no hype words. Reads like an artisan who knows their craft is enough.',
    ARRAY[
      'Reference materials and process — what was made and how.',
      'Show hands and craft over product alone.',
      'Honor the wait — slow, deliberate cadence over urgency.'
    ],
    ARRAY[
      'Trend slang ("fr", "lowkey").',
      'Generic adjectives ("beautiful", "stunning").',
      'Stock photography or drop-shadow text.'
    ],
    ARRAY['#SlowCraft', '#MadeByHand', '#OneOfOne'],
    true
  ),
  (
    NULL,
    'High Energy',
    'Punchy, exclamation-forward, leans into trends and FOMO.',
    'Punchy and high-energy. Lead with the most arresting moment. Embrace exclamations, urgency, and trend-aware phrasing. Always end with a hook.',
    ARRAY[
      'Open with a stopper — question, claim, or hot take.',
      'Use trending audio and platform-native phrasing.',
      'Hard CTAs — tell people exactly what to do.'
    ],
    ARRAY[
      'Long preamble — get to the point in line one.',
      'Editorial pacing or quiet poetry.',
      'Generic feel-good language.'
    ],
    ARRAY['#Trending', '#Viral', '#FYP'],
    true
  ),
  (
    NULL,
    'Editorial',
    'Long-form, considered, magazine-feature register. Cites craft.',
    'Editorial, considered, generous with context. Long-form viewers come for depth — give it. Cite the craft, the people, the process.',
    ARRAY[
      'Open with a scene or anecdote.',
      'Name the maker, the place, the technique.',
      'Build to a clear thesis or insight.'
    ],
    ARRAY[
      'Bullet points or list-form content.',
      'Slang or platform-trend phrasing.',
      'Sales-forward CTAs.'
    ],
    ARRAY['#Craft', '#Editorial', '#Maker'],
    true
  ),
  (
    NULL,
    'Luxury Minimal',
    'Understated, white-space heavy. Lets the product speak.',
    'Understated and minimal. Let the product carry weight. Use white space generously. One claim per piece, one hero image per post.',
    ARRAY[
      'Single-line captions where possible.',
      'Reference quality, materials, and provenance.',
      'Visual rests — empty negative space is intentional.'
    ],
    ARRAY[
      'Multi-paragraph captions.',
      'Hashtag clutter — three or fewer per post.',
      'Bright accent colors that compete with the product.'
    ],
    ARRAY['#Minimal', '#Quiet', '#Luxury'],
    true
  );
