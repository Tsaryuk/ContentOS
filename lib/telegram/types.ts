// Telegram integration types

export interface TgAccountRow {
  id: string
  phone: string
  session_string: string
  first_name: string | null
  username: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

export interface TgChannelRow {
  id: string
  tg_account_id: string
  tg_channel_id: number
  title: string
  username: string | null
  project_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type TgPostStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'

export interface TgPostRow {
  id: string
  channel_id: string
  video_id: string | null
  content: string
  media_urls: string[]
  status: TgPostStatus
  scheduled_at: string | null
  sent_at: string | null
  tg_message_id: number | null
  error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TgPostWithChannel extends TgPostRow {
  channel: Pick<TgChannelRow, 'id' | 'title' | 'username'>
}
