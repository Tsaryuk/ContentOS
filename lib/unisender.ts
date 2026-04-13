const API_BASE = 'https://api.unisender.com/ru/api'

function getApiKey(): string {
  const key = process.env.UNISENDER_API_KEY
  if (!key) throw new Error('UNISENDER_API_KEY not configured')
  return key
}

function getListId(): number {
  const id = process.env.UNISENDER_LIST_ID
  if (!id) throw new Error('UNISENDER_LIST_ID not configured')
  return parseInt(id, 10)
}

interface UnisenderResponse<T> {
  result?: T
  error?: string
  code?: string
  warnings?: string[]
}

async function call<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams()
  body.append('api_key', getApiKey())
  for (const [k, v] of Object.entries(params)) {
    body.append(k, String(v))
  }

  const res = await fetch(`${API_BASE}/${method}?format=json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`Unisender ${method}: HTTP ${res.status}`)
  }

  const json: UnisenderResponse<T> = await res.json()
  if (json.error) {
    throw new Error(`Unisender ${method}: [${json.code}] ${json.error}`)
  }

  return json.result as T
}

// --- Messages ---

interface CreateEmailMessageResult {
  message_id: number
}

export async function createEmailMessage(opts: {
  senderName: string
  senderEmail: string
  subject: string
  bodyHtml: string
  listId?: number
  generateText?: boolean
}): Promise<number> {
  const result = await call<CreateEmailMessageResult>('createEmailMessage', {
    sender_name: opts.senderName,
    sender_email: opts.senderEmail,
    subject: opts.subject,
    body: opts.bodyHtml,
    list_id: opts.listId ?? getListId(),
    generate_text: opts.generateText !== false ? 1 : 0,
  })
  return result.message_id
}

// --- Campaigns ---

interface CreateCampaignResult {
  campaign_id: number
  status: string
  count: number
}

export async function createCampaign(opts: {
  messageId: number
  startTime?: string // "YYYY-MM-DD HH:MM" UTC
  trackRead?: boolean
  trackLinks?: boolean
}): Promise<{ campaignId: number; status: string }> {
  const params: Record<string, string | number> = {
    message_id: opts.messageId,
    track_read: opts.trackRead !== false ? 1 : 0,
    track_links: opts.trackLinks !== false ? 1 : 0,
  }
  if (opts.startTime) {
    params.start_time = opts.startTime
    params.timezone = 'UTC'
  }
  const result = await call<CreateCampaignResult>('createCampaign', params)
  return { campaignId: result.campaign_id, status: result.status }
}

// --- Statistics ---

interface CampaignStats {
  total: number
  sent: number
  delivered: number
  read_unique: number
  read_all: number
  clicked_unique: number
  clicked_all: number
  unsubscribed: number
  spam: number
}

export async function getCampaignStats(campaignId: number): Promise<CampaignStats> {
  return call<CampaignStats>('getCampaignCommonStats', { campaign_id: campaignId })
}

interface CampaignStatus {
  status: string
  creation_time: string
  start_time: string
}

export async function getCampaignStatus(campaignId: number): Promise<CampaignStatus> {
  return call<CampaignStatus>('getCampaignStatus', { campaign_id: campaignId })
}

// --- Subscribers ---

interface SubscribeResult {
  person_id: number
}

export async function subscribe(email: string, name?: string, listId?: number): Promise<number> {
  const params: Record<string, string | number> = {
    list_ids: listId ?? getListId(),
    'fields[email]': email,
    double_optin: 3,
  }
  if (name) {
    params['fields[Name]'] = name
  }
  const result = await call<SubscribeResult>('subscribe', params)
  return result.person_id
}

interface ContactCountResult {
  count: string
}

export async function getContactCount(listId?: number): Promise<number> {
  const result = await call<ContactCountResult>('getContactCount', {
    list_id: listId ?? getListId(),
    'params[type]': 'address',
  })
  return parseInt(result.count, 10) || 0
}

// --- Campaigns list ---

interface CampaignListItem {
  id: number
  start_time: string
  status: string
  message_id: number
  list_id: number
  subject: string
  sender_name: string
  sender_email: string
}

export async function getCampaigns(limit = 50): Promise<CampaignListItem[]> {
  return call<CampaignListItem[]>('getCampaigns', { limit })
}
