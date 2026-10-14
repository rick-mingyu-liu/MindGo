import { api } from '@/utils/api'

export type ReplyLanguage = 'auto' | 'en' | 'zh'
export interface AgentContext { currency: string; timezone: string; language: ReplyLanguage }
export interface Conversation extends AgentContext { id: string; title: string; created_at: string; updated_at: string }
export interface DraftRow {
  id: string; amount: string; description: string; category: string
  type: 'income' | 'expense'; date: string; currency: string
}
export interface Draft {
  id: string; version: number; status: 'pending' | 'confirmed' | 'cancelled' | 'expired'
  rows: DraftRow[]; expires_at: string
}
export interface Receipt {
  id: string; transaction_ids: number[]; undo_until: string; undone_at: string | null; created_at: string
}
export interface ConversationState {
  conversation: Conversation
  messages: { id: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'failed' | 'cancelled'; created_at: string }[]
  draft: Draft | null
  receipts: Receipt[]
  run: { id: string; status: 'running' | 'complete' | 'failed' | 'cancelled'; error_code: string | null } | null
}
export interface MessageRequest extends AgentContext { requestId: string; content: string }
export interface ConfirmRequest { version: number; rowIds: string[]; requestId: string }
const path = (id: string) => `/agent/conversations/${encodeURIComponent(id)}`

export const agentAPI = {
  status: () => api.get<{ available: boolean }>('/agent/status').then(r => r.data),
  list: () => api.get<{ conversations: Conversation[] }>('/agent/conversations').then(r => r.data.conversations),
  create: (context: AgentContext, signal?: AbortSignal) => api.post<{ conversation: Conversation }>('/agent/conversations', context, { signal }).then(r => r.data.conversation),
  get: (id: string) => api.get<ConversationState>(path(id)).then(r => r.data),
  remove: (id: string) => api.delete(path(id)),
  clear: () => api.delete('/agent/conversations'),
  send: (id: string, body: MessageRequest, signal: AbortSignal) => api.post<ConversationState>(`${path(id)}/messages`, body, { signal }).then(r => r.data),
  cancel: (id: string, requestId: string) => api.post(`${path(id)}/runs/${encodeURIComponent(requestId)}/cancel`),
  edit: (id: string, version: number, rows: DraftRow[]) => api.patch<ConversationState>(`${path(id)}/draft`, { version, rows }).then(r => r.data),
  discard: (id: string, version: number) => api.delete<ConversationState>(`${path(id)}/draft`, { data: { version } }).then(r => r.data),
  confirm: (id: string, body: ConfirmRequest) => api.post<ConversationState>(`${path(id)}/confirm`, body).then(r => r.data),
  undo: (id: string) => api.post(`/agent/receipts/${encodeURIComponent(id)}/undo`),
}

export function agentErrorCode(error: unknown): string {
  const candidate = error as { response?: { status?: number; data?: { code?: string } } }
  return candidate?.response?.data?.code
    || (candidate?.response?.status === 429 ? 'agent_rate_limited' : 'agent_network_error')
}

export function agentOutcomeUnknown(error: unknown): boolean {
  const candidate = error as { response?: { status?: number } }
  return !candidate?.response || (candidate.response.status || 0) >= 500
}

export function agentUnavailable(error: unknown): boolean {
  const candidate = error as { response?: { status?: number } }
  return candidate?.response?.status === 503 && agentErrorCode(error) === 'agent_unavailable'
}
