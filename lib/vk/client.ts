// Minimal VK API client for the VK Video integration.
//
// Scope of the integration: edit a video's title (name) and description (desc)
// via video.edit; list videos via video.get; discover admin communities via
// groups.get. VK has no public method to set a custom video cover.

const VK_API_VERSION = '5.199'
const VK_API_BASE = 'https://api.vk.com/method'

export class VkApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
    this.name = 'VkApiError'
  }
}

async function vkApi<T = unknown>(
  method: string,
  params: Record<string, string | number>,
  token: string,
): Promise<T> {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) body.set(k, String(v))
  body.set('access_token', token)
  body.set('v', VK_API_VERSION)

  const res = await fetch(`${VK_API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (data.error) {
    throw new VkApiError(data.error.error_code ?? 0, data.error.error_msg ?? 'VK API error')
  }
  return data.response as T
}

export interface VkVideoItem {
  id: number
  owner_id: number
  title: string
  description: string
  duration?: number
  views?: number
  date?: number // unix seconds
}

/** List videos for an owner (community owner_id is negative). */
export async function getOwnerVideos(
  ownerId: number,
  token: string,
  opts: { count?: number; offset?: number } = {},
): Promise<{ count: number; items: VkVideoItem[] }> {
  return vkApi('video.get', { owner_id: ownerId, count: opts.count ?? 100, offset: opts.offset ?? 0 }, token)
}

/** Edit a video's title and/or description. Returns 1 on success. */
export async function editVideo(
  ownerId: number,
  videoId: number,
  fields: { name?: string; desc?: string },
  token: string,
): Promise<number> {
  const params: Record<string, string | number> = { owner_id: ownerId, video_id: videoId }
  if (fields.name !== undefined) params.name = fields.name
  if (fields.desc !== undefined) params.desc = fields.desc
  return vkApi('video.edit', params, token)
}

export interface VkAdminGroup {
  id: number
  name: string
  screen_name?: string
  photo_200?: string
}

/** Communities the token's user administers (requires the `groups` scope). */
export async function getAdminGroups(token: string): Promise<VkAdminGroup[]> {
  const res = await vkApi<{ count: number; items: VkAdminGroup[] }>(
    'groups.get',
    { filter: 'admin', extended: 1, count: 1000 },
    token,
  )
  return res.items ?? []
}
