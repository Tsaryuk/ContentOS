import { supabaseAdmin } from '@/lib/supabase'
import type { VideoRow, ChannelRow, ChannelRules, JobType, JobStatus, VideoStatus, ChangeSource } from './types'

export async function updateVideoStatus(
  videoId: string,
  status: VideoStatus,
  errorMessage?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (errorMessage !== undefined) {
    update.error_message = errorMessage
  }
  if (status !== 'error') {
    update.error_message = null
  }

  const { error } = await supabaseAdmin
    .from('yt_videos')
    .update(update)
    .eq('id', videoId)

  if (error) throw new Error(`Failed to update status: ${error.message}`)
}

export async function logJob(params: {
  videoId?: string
  jobType: JobType
  status: JobStatus
  result?: Record<string, unknown>
  error?: string
}): Promise<string> {
  const row: Record<string, unknown> = {
    job_type: params.jobType,
    status: params.status,
  }
  if (params.videoId) row.video_id = params.videoId
  if (params.result) row.result = params.result
  if (params.error) row.error = params.error
  if (params.status === 'running') row.started_at = new Date().toISOString()
  if (params.status === 'done' || params.status === 'failed') row.finished_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('yt_jobs')
    .insert(row)
    .select('id')
    .single()

  if (error) throw new Error(`Failed to log job: ${error.message}`)
  return data.id
}

export async function logChange(params: {
  videoId: string
  field: string
  oldValue: string | null
  newValue: string | null
  source: ChangeSource
}): Promise<void> {
  await supabaseAdmin.from('yt_changes').insert({
    video_id: params.videoId,
    field: params.field,
    old_value: params.oldValue,
    new_value: params.newValue,
    source: params.source,
  })
}

export async function getVideoWithChannel(videoId: string): Promise<{
  video: VideoRow
  channel: ChannelRow
  rules: ChannelRules
}> {
  const { data: video, error: vErr } = await supabaseAdmin
    .from('yt_videos')
    .select('*')
    .eq('id', videoId)
    .single()

  if (vErr || !video) throw new Error(`Video not found: ${videoId}`)

  const { data: channel, error: cErr } = await supabaseAdmin
    .from('yt_channels')
    .select('*')
    .eq('id', video.channel_id)
    .single()

  if (cErr || !channel) throw new Error(`Channel not found for video: ${videoId}`)

  return {
    video: video as VideoRow,
    channel: channel as ChannelRow,
    rules: channel.rules as ChannelRules,
  }
}
