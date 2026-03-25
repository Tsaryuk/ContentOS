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
}

export interface ChannelRow {
  id: string
  yt_channel_id: string
  title: string
  handle: string
  rules: ChannelRules
}

export type JobType = 'sync_channel' | 'transcribe' | 'generate' | 'thumbnail' | 'publish'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type VideoStatus = 'pending' | 'transcribing' | 'generating' | 'thumbnail' | 'review' | 'publishing' | 'done' | 'error'
export type ChangeSource = 'ai' | 'manual'
