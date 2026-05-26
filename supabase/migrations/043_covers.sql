-- 043_covers.sql
-- Universal cover generator: shared by articles, videos, newsletters,
-- telegram posts, carousels, podcasts. Replaces the ad-hoc per-route
-- cover generation in /api/articles/cover, /api/thumbnail/generate.
--
-- Two tables:
--   cover_styles      — admin-curated prompt templates ("Engraving Doré",
--                       "Minimal Editorial", etc.). The promptable seed is
--                       installed below; admins can add more via UI later.
--   cover_generations — every generate-call lands one row; `variants`
--                       JSONB holds N images (typically 3). When user
--                       picks one, picked_url+picked_kind are set and
--                       the chosen image is copied to our storage.

CREATE TABLE IF NOT EXISTS cover_styles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Prompt fragments combined at generation time. `scene_template` accepts
  -- a {scene} placeholder; multi-variant styles supply variant prompts in
  -- the `variants` JSONB array (each entry: { kind, label, prompt }).
  -- Single-variant styles set variants=[] and use only scene_template.
  scene_template  TEXT NOT NULL,
  variants        JSONB NOT NULL DEFAULT '[]'::jsonb,
  negative_prompt TEXT,
  -- Default generation params; can be overridden per call.
  model           TEXT NOT NULL DEFAULT 'fal-ai/flux/dev',
  default_aspect  TEXT NOT NULL DEFAULT '16:9' CHECK (default_aspect IN ('16:9', '1:1', '9:16', '4:5', '3:2')),
  brand_palette   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of hex strings, optional
  -- Which content types this style is offered for. Empty = all.
  target_kinds    TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_styles_active_sort
  ON cover_styles(sort_order, name)
  WHERE is_active = true;

ALTER TABLE cover_styles DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cover_generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  style_id        UUID REFERENCES cover_styles(id) ON DELETE SET NULL,
  -- Which entity this generation belongs to. (target_kind, target_id) is
  -- soft FK — different content types live in different tables so we
  -- don't enforce referential integrity here.
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('article', 'video', 'newsletter', 'telegram_post', 'carousel', 'podcast')),
  target_id       UUID,
  -- Input context the user typed / the system passed.
  title           TEXT NOT NULL,
  description     TEXT,
  scene           TEXT NOT NULL,            -- resolved scene text sent into prompts
  aspect          TEXT NOT NULL,
  -- Array of { kind, label, url, prompt_head } objects — fal.ai URLs,
  -- ephemeral (~24h). picked_url below is the one we copy to storage.
  variants        JSONB NOT NULL DEFAULT '[]'::jsonb,
  picked_kind     TEXT,
  picked_url      TEXT,                     -- our storage URL after pick
  picked_at       TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'picked', 'failed')),
  error           TEXT,
  created_by      UUID,                     -- session user id, advisory
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cover_generations_target
  ON cover_generations(target_kind, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cover_generations_project_recent
  ON cover_generations(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE cover_generations DISABLE ROW LEVEL SECURITY;

-- Seed 5 starting styles. Engraving Doré is a port of the existing
-- /api/articles/cover prompt (light/dark/full triplet). The other four
-- give the user immediate variety without waiting on admin UI.
INSERT INTO cover_styles (slug, name, description, scene_template, variants, negative_prompt, model, default_aspect, target_kinds, sort_order)
VALUES
  (
    'engraving-dore',
    'Гравюра (Доре)',
    'Чёрно-белая ксилографическая гравюра в стиле Гюстава Доре. 3 варианта композиции.',
    'a symbolic classical scene about "{scene}"',
    '[
      {"kind":"light","label":"Светлая","prompt":"{scene_resolved}, rendered as a dense black-ink woodcut engraving in the style of Gustave Doré. Intricate crosshatching, fine parallel ink lines, stark high contrast, pure black ink on white paper. The subject is centered and fills about 60-70% of the canvas. The BACKGROUND IS PURE WHITE, clean and empty — white extends fully to all four edges of the image. No vignette, no border, no torn paper edge, no paper texture around the subject. Wide 16:9 cinematic composition."},
      {"kind":"dark","label":"Тёмная","prompt":"{scene_resolved}, rendered in WHITE INK on a SOLID PURE BLACK BACKGROUND — inverted woodcut engraving, negative-print style, fine white parallel lines and white crosshatching on deep black, classical 19th-century engraving technique but in reverse print. Subject centered, fills about 60-70% of the canvas, glowing against the black. Background is uniform solid black, extends fully to all four edges. No vignette, no border. Wide 16:9 cinematic composition."},
      {"kind":"full","label":"Полная гравюра","prompt":"Extreme close-up of {scene_resolved} as a dense black-ink woodcut engraving that EXTENDS BEYOND THE FRAME on all four sides — the scene overflows and is cropped by the canvas edges. The subject is so large it fills 100% of the image with no space around it. Black ink fills every corner, every edge pixel. Intricate crosshatching, fine parallel ink lines, stark high contrast, Gustave Doré style. Wide 16:9 composition."}
    ]'::jsonb,
    'ABSOLUTELY NO: text, letters, numbers, logos, signatures, watermarks, captions, frames, book-cover layouts, horror imagery, hooded figures, gore, skulls.',
    'fal-ai/flux/dev',
    '16:9',
    ARRAY['article','newsletter','telegram_post']::text[],
    10
  ),
  (
    'minimal-editorial',
    'Минимал (редакционный)',
    'Чистая editorial-обложка: одна форма, мягкий цвет, много воздуха.',
    'a single iconic minimal object representing "{scene}", flat geometric shape, on a soft pastel background',
    '[
      {"kind":"warm","label":"Тёплая","prompt":"{scene_resolved}, editorial minimal illustration, single object centered, generous negative space, muted warm palette (cream, terracotta, soft ochre), soft matte texture, subtle paper grain, contemporary publication style à la The New Yorker, no outline, no text. 16:9 wide composition."},
      {"kind":"cool","label":"Холодная","prompt":"{scene_resolved}, editorial minimal illustration, single object centered, generous negative space, muted cool palette (off-white, dusty blue, slate), soft matte texture, contemporary publication style, no outline, no text. 16:9 wide composition."},
      {"kind":"mono","label":"Графит","prompt":"{scene_resolved}, editorial minimal illustration, single object centered, monochrome graphite-on-paper, generous negative space, hand-drawn restraint, contemporary publication style, no outline, no text. 16:9 wide composition."}
    ]'::jsonb,
    'NO text, NO letters, NO numbers, NO logos, NO watermarks, NO frames, NO busy details, NO photorealism.',
    'fal-ai/flux/dev',
    '16:9',
    ARRAY['article','newsletter','telegram_post','carousel']::text[],
    20
  ),
  (
    'cinematic',
    'Кинематографичный',
    'Атмосферный фотореалистичный кадр в духе постера к фильму.',
    'a cinematic still about "{scene}", anamorphic lens, shallow depth of field, atmospheric',
    '[
      {"kind":"warm","label":"Тёплый закат","prompt":"{scene_resolved}, cinematic photograph, golden hour light, anamorphic lens flare, shallow depth of field, warm cinematic color grade (teal-and-orange), 35mm film grain, wide composition, hyper-detailed. No text, no captions."},
      {"kind":"cool","label":"Холодный","prompt":"{scene_resolved}, cinematic photograph, twilight blue hour, soft volumetric haze, anamorphic lens, shallow depth of field, cool desaturated palette with one accent color, 35mm film grain, wide composition, hyper-detailed. No text, no captions."},
      {"kind":"noir","label":"Нуар","prompt":"{scene_resolved}, cinematic photograph, hard chiaroscuro lighting, deep shadows, single hard rim-light, monochrome film noir palette, 35mm film grain, anamorphic flare, wide composition, hyper-detailed. No text, no captions."}
    ]'::jsonb,
    'NO text overlays, NO subtitles, NO logos, NO watermarks, NO movie-poster title bars.',
    'fal-ai/flux/dev',
    '16:9',
    ARRAY['video','article','podcast']::text[],
    30
  ),
  (
    'hand-drawn',
    'От руки',
    'Свободный набросок гелевой ручкой или акварель — тёплый авторский тон.',
    'a loose hand-drawn illustration of "{scene}"',
    '[
      {"kind":"ink","label":"Тушь","prompt":"{scene_resolved}, loose ink pen sketch on cream paper, confident single-line drawing with occasional crosshatching, slightly imperfect, scanned-from-notebook aesthetic, off-white paper background with subtle fiber texture. No text, no signature."},
      {"kind":"watercolor","label":"Акварель","prompt":"{scene_resolved}, light watercolor illustration on cold-press paper, soft wet-on-wet bleeds, gentle pigment pools, restrained palette of 3-4 colors, hand-drawn line layer overtop, contemplative artbook feel. No text, no signature."},
      {"kind":"pencil","label":"Карандаш","prompt":"{scene_resolved}, graphite pencil sketch on textured paper, mix of fine lines and broad smudges, subtle erased highlights, soft tonal range, sketchbook aesthetic. No text, no signature."}
    ]'::jsonb,
    'NO text, NO photoreal rendering, NO 3D, NO digital glow.',
    'fal-ai/flux/dev',
    '16:9',
    ARRAY['article','newsletter','telegram_post','carousel']::text[],
    40
  ),
  (
    'youtube-hook',
    'YouTube hook',
    'Яркая, контрастная превью с одним выраженным фокусом — кликбейт без текста.',
    'a dramatic close-up that visually hooks the topic "{scene}"',
    '[
      {"kind":"bold","label":"Яркий","prompt":"{scene_resolved}, extreme close-up, very high contrast, saturated complementary colors, sharp focus on a single emotion-driving element, dramatic rim-light, slight wide-angle lens distortion, YouTube-thumbnail energy. No text, no logos, no watermarks, no UI mockups."},
      {"kind":"clean","label":"Чистый","prompt":"{scene_resolved}, single subject on a deep clean background (one solid colour), strong studio lighting, crisp edges, designer-grade composition, room reserved on left third for overlay text added later. No text rendered in the image, no logos, no watermarks."},
      {"kind":"split","label":"Дуэт","prompt":"{scene_resolved}, two contrasting elements split left/right of the frame, strong colour contrast between halves, high saturation, dramatic studio lighting, designed to imply conflict or comparison. No text, no logos, no watermarks."}
    ]'::jsonb,
    'NO embedded text, NO YouTube logo, NO play-button icons, NO subscribe arrows.',
    'fal-ai/flux/dev',
    '16:9',
    ARRAY['video']::text[],
    50
  )
ON CONFLICT (slug) DO NOTHING;
