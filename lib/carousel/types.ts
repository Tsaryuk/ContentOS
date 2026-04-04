export interface CarouselSlide {
  title: string
  subtitle?: string
  tag?: string
  body?: string
  lead?: string
  bold?: string
  label1?: string
  col1?: string
  label2?: string
  col2?: string
  example?: string
  illustrationPrompt?: string
  align?: 'left' | 'center' | 'right'
}

export interface CarouselStyle {
  mood: string
  illustrationStyle: string
  accentColor: string
  bgTint: string
}

export interface CarouselGenerateResult {
  slides: CarouselSlide[]
  caption: string
  hashtags: string
  illustrationPrompt: string
  style: CarouselStyle
}

export interface BrandPreset {
  handle: string
  name: string
  headFont: string
  bodyFont: string
  ink: string
  light: string
  dark: string
  accent: string
  avatarLetter: string
  photoUrl?: string
}

export const BRAND_PRESETS: Record<string, BrandPreset> = {
  tsaryuk: {
    handle: '@mr.tsaryuk',
    name: 'Денис Царюк',
    headFont: 'Unbounded',
    bodyFont: 'Manrope',
    ink: '#1C1A17',
    light: '#F7F5F0',
    dark: '#1C1A17',
    accent: '#F0EDE6',
    avatarLetter: 'Д',
  },
  bold: {
    handle: '@brand',
    name: 'Bold Dark',
    headFont: 'Fraunces',
    bodyFont: 'Outfit',
    ink: '#0A0A0A',
    light: '#F5F5F5',
    dark: '#0A0A0A',
    accent: '#E8E500',
    avatarLetter: 'B',
  },
  warm: {
    handle: '@brand',
    name: 'Warm Edit',
    headFont: 'Lora',
    bodyFont: 'Nunito',
    ink: '#2C1810',
    light: '#FDF6EE',
    dark: '#2C1810',
    accent: '#C4742A',
    avatarLetter: 'W',
  },
}

export interface VoiceStyle {
  id: string
  project_id: string | null
  name: string
  examples: string[]
  voice_prompt: string
  summary: string | null
  created_at: string
}

export type CarouselStatus = 'draft' | 'generating' | 'illustrating' | 'ready' | 'exported' | 'error'

export interface CarouselRow {
  id: string
  project_id: string | null
  channel_id: string | null
  video_id: string | null
  topic: string
  audience: string | null
  tone: string
  preset: string
  slide_count: number
  slides: CarouselSlide[] | null
  caption: string | null
  hashtags: string | null
  illustration_prompt: string | null
  illustration_url: string | null
  illustration_urls: Record<number, string> | null
  style: CarouselStyle | null
  voice_id: string | null
  source_text: string | null
  source_type: string | null
  export_urls: string[] | null
  export_zip_url: string | null
  status: CarouselStatus
  error: string | null
  created_at: string
  updated_at: string
}
