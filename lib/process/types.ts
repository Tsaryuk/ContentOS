export interface ChannelRules {
  title_format: string
  description_template: string
  required_links: string[]
  hashtags_fixed: string[]
  thumbnail_style_id: string
  shorts_count: number
  clip_max_minutes: number
}

export interface TranscriptChunk {
  start: number
  end: number
  text: string
}

export interface Timecode {
  time: string
  label: string
}

export interface Clip {
  start: number
  end: number
  title: string
  type: 'clip' | 'short'
}

// --- Producer Agent Types ---

export type TitleStyle = 'hook' | 'question' | 'statement' | 'curiosity_gap' | 'listicle'

export interface TitleVariant {
  text: string
  reasoning: string
  style: TitleStyle
  is_recommended: boolean
}

export interface ClipSuggestion {
  start: number
  end: number
  title_variants: TitleVariant[]
  description: string
  tags: string[]
  thumbnail_prompt: string
  why_it_works: string
  type: 'clip' | 'short'
  hook_text?: string
}

export interface ThumbnailSpec {
  prompt: string
  text_overlay_variants: string[]
  style_notes: string
}

export interface SocialDraft {
  platform: 'telegram' | 'youtube_community' | 'instagram_stories'
  content: string
}

export interface GuestInfo {
  name: string
  description: string
  topics: string[]
}

export interface ProducerOutput {
  title_variants: TitleVariant[]
  description: string
  tags: string[]
  timecodes: Timecode[]
  thumbnail_spec: ThumbnailSpec
  thumbnail_urls?: string[]
  ai_score: number
  clip_suggestions: ClipSuggestion[]
  short_suggestions: ClipSuggestion[]
  social_drafts: SocialDraft[]
  guest_info?: GuestInfo
  content_summary: string
}

export interface SelectedVariants {
  title_index: number | null
  thumbnail_text_index: number | null
  clips_selected: number[]
  shorts_selected: number[]
}

export interface ContentTypeRules {
  title_format: string
  description_template: string
  hashtags: string[]
}

export interface SocialTemplates {
  telegram?: string
  youtube_community?: string
  instagram_stories?: string
}

export interface ThumbnailPreferences {
  colors?: string[]
  font_style?: string
  layout?: string
  reference_url?: string
}

export interface ExtendedChannelRules extends ChannelRules {
  podcast_rules?: ContentTypeRules
  clip_rules?: ContentTypeRules
  short_rules?: ContentTypeRules
  social_templates?: SocialTemplates
  thumbnail_preferences?: ThumbnailPreferences
  brand_voice?: string
  guest_info_template?: string
  thumbnail_style_prompt?: string
  channel_links?: string
}

// --- Core Types ---

export type ContentType = 'podcast' | 'clip' | 'short'

export interface VideoRow {
  id: string
  yt_video_id: string
  channel_id: string
  current_title: string
  current_description: string
  current_tags: string[] | null
  current_thumbnail: string
  duration_seconds: number
  published_at: string
  view_count: number
  like_count: number
  status: string
  transcript: string | null
  transcript_chunks: TranscriptChunk[] | null
  generated_title: string | null
  generated_description: string | null
  generated_tags: string[] | null
  generated_timecodes: Timecode[] | null
  generated_clips: Clip[] | null
  thumbnail_url: string | null
  ai_score: number | null
  is_approved: boolean
  is_published_back: boolean
  error_message: string | null
  producer_output: ProducerOutput | null
  selected_variants: SelectedVariants | null
  content_type: ContentType
  parent_video_id: string | null
}

export interface ChannelRow {
  id: string
  yt_channel_id: string
  title: string
  handle: string
  rules: ExtendedChannelRules
}

export type JobType = 'sync_channel' | 'transcribe' | 'generate' | 'thumbnail' | 'publish' | 'produce'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type VideoStatus = 'pending' | 'transcribing' | 'producing' | 'generating' | 'thumbnail' | 'review' | 'publishing' | 'done' | 'error'
export type ChangeSource = 'ai' | 'manual'
