export interface ThumbnailStylePreset {
  id: string
  name: string
  description: string
  prompt: string
}

export const DEFAULT_STYLE_PRESETS: ThumbnailStylePreset[] = [
  {
    id: 'classic',
    name: 'Классика',
    description: 'Базовый тёмно-зелёный стиль канала (как сейчас)',
    prompt: '',
  },
  {
    id: 'minimal',
    name: 'Минимализм',
    description: 'Светлый фон, без свечения, крупный контрастный текст',
    prompt: [
      'STYLE OVERRIDE — Swiss minimalist poster:',
      'IGNORE the previous dark green background instructions.',
      'Background: flat warm off-white (#F4F1EC) OR solid light grey (#E5E5E5), with gentle paper-like texture. NO glow, NO ambient light.',
      'Subject: razor-sharp, crisply lit with soft daylight from above-left, shallow shadow on the far side. Natural skin tones, no color grade.',
      'Text: deep black (#0A0A0A) headline + ONE accent word in strong coral-red (#E24438) or bottle-green (#1A5E3C). Geometric sans-serif (Helvetica Now / Inter Display), heavy weight, tight kerning.',
      'Composition: generous negative space, everything aligned to an invisible grid, faces never crowd the text.',
      'Mood: calm, confident, premium. No drama, no glow effects, no gradients.',
    ].join(' '),
  },
  {
    id: 'bold',
    name: 'Яркий',
    description: 'Неон, максимум цвета и контраста, поп-дизайн',
    prompt: [
      'STYLE OVERRIDE — high-energy neon poster:',
      'REPLACE the dark green background with a saturated duotone gradient: hot magenta (#FF007F) diagonally into electric cyan (#00E1FF), OR acid yellow (#F5FF00) into deep violet (#4A1A8A).',
      'Subject lit with hard split-lighting: neon-pink rim on one side, cyan rim on the other, crunchy highlights, slight chromatic aberration on edges.',
      'Text: chunky heavy italic sans-serif (Obviously / Druk), pure white with a 4px offset drop-shadow in the opposite gradient color. Slight upward tilt for dynamism.',
      'Composition: subject scaled +10%, slightly tilted, grainy halftone overlay (~15% opacity), subtle scan-lines. Pop-art energy.',
      'Mood: loud, youthful, click-bait-adjacent but tasteful. Contrast cranked to the maximum readable level.',
    ].join(' '),
  },
  {
    id: 'editorial',
    name: 'Редакторский',
    description: 'Глянцевая журнальная фотография, приглушённая палитра',
    prompt: [
      'STYLE OVERRIDE — high-end editorial magazine cover (Vogue / Monocle / The New Yorker):',
      'REPLACE the dark green background with a muted sophisticated backdrop: warm taupe (#B8A99A), dusty sage (#8A9A7B), or deep oxblood (#6B2A2A). Smooth seamless studio paper, no texture noise.',
      'Subject: cinematic 85mm portrait feel, soft butterfly lighting, shallow depth of field, subtle film-grain (Kodak Portra 400). Skin retains natural texture, no over-smoothing.',
      'Text: refined serif display (GT Sectra / Canela) for the headline, ALL-CAPS thin sans (Söhne / Neue Haas Grotesk) for the accent line. Ivory-white text with hairline letter-spacing. Optional thin horizontal rules above/below.',
      'Composition: 60/40 asymmetric layout, deliberate whitespace, low visual density. Everything reads as "curated", not "designed".',
      'Mood: understated, intelligent, aspirational. Anti-YouTube aesthetic — closer to print.',
    ].join(' '),
  },
  {
    id: 'cinematic',
    name: 'Киношный',
    description: 'Teal/orange грейдинг, атмосфера триллера',
    prompt: [
      'STYLE OVERRIDE — prestige-TV cinematic still (True Detective / Sicario / Blade Runner 2049):',
      'REPLACE the dark green background with a teal-shadow / orange-highlight grade (Denis Villeneuve / Roger Deakins palette). Deep navy-teal (#0D2137) shadows, amber-orange (#D97A2E) highlights, crushed blacks.',
      'Lighting: strong motivated key light from one side (practical source feel — window / neon sign / sodium streetlamp), heavy shadow fall-off on the other side of the face. Atmospheric haze / light volumetrics in the background.',
      'Subject: anamorphic 2.4:1 feel even in 16:9, lens flares acceptable, heavy film-grain, subtle halation around bright edges.',
      'Text: condensed all-caps display (Druk Condensed / Trade Gothic Bold Condensed), warm off-white (#F5EFE0), stacked vertically on the side, small caps-height. Treat text like a movie title card, not a YouTube overlay.',
      'Mood: tense, serious, grown-up. Think: final frame before the credits.',
    ].join(' '),
  },
  {
    id: 'documentary',
    name: 'Документальный',
    description: 'Честная фотожурналистика, естественный свет, без обработки',
    prompt: [
      'STYLE OVERRIDE — Magnum-Photos documentary portrait:',
      'REPLACE the dark green background with a real-looking environment: neutral interior wall, out-of-focus office/studio, or natural window-lit setting. Muted earth-tone palette, no saturation boost.',
      'Lighting: single soft natural window-light, visible imperfections, honest skin texture, no beauty retouch. Feels unposed even though it is framed.',
      'Subject: mid-action micro-expression (about to speak, mid-thought), hands sometimes visible, slightly off-center. Looks captured, not constructed.',
      'Text: plain humanist sans-serif (Söhne / IBM Plex Sans), small size, lower-left corner, white or black depending on background luminance. Feels like a caption, not a headline.',
      'Mood: credible, journalistic, serious. No glow, no gradients, no drama — the person does the work.',
    ].join(' '),
  },
]

function isValidPreset(value: unknown): value is ThumbnailStylePreset {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.id === 'string' && p.id.length > 0
    && typeof p.name === 'string' && p.name.length > 0
    && typeof p.prompt === 'string'
    && (p.description === undefined || typeof p.description === 'string')
}

export function resolveStylePresets(rules: unknown): ThumbnailStylePreset[] {
  const custom = (rules as { thumbnail_style_presets?: unknown } | null | undefined)?.thumbnail_style_presets
  if (Array.isArray(custom) && custom.length > 0 && custom.every(isValidPreset)) {
    return custom as ThumbnailStylePreset[]
  }
  return DEFAULT_STYLE_PRESETS
}

export function resolveStylePreset(rules: unknown, styleId: string | null | undefined): ThumbnailStylePreset {
  const presets = resolveStylePresets(rules)
  if (styleId) {
    const found = presets.find(p => p.id === styleId)
    if (found) return found
  }
  return presets[0]
}
