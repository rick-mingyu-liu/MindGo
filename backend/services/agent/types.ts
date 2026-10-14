export class AgentError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); this.name = 'AgentError'; }
}
export interface ConversationSettings { currency: string; timezone: string; language: 'auto' | 'en' | 'zh' }
export interface Conversation extends ConversationSettings { id: string; title: string; created_at: Date; updated_at: Date }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'failed' | 'cancelled'; created_at: Date }
export interface DraftRow { id: string; amount: string; description: string; category: string; type: 'expense' | 'income'; date: string; currency: string }
export interface Draft { id: string; version: number; status: 'pending' | 'confirmed' | 'cancelled' | 'expired'; rows: DraftRow[]; expires_at: Date }
export interface Receipt { id: string; transaction_ids: number[]; undo_until: Date; undone_at: Date | null; created_at: Date }
export interface Run { id: string; status: 'running' | 'complete' | 'failed' | 'cancelled'; error_code: string | null }
export interface ConversationState { conversation: Conversation; messages: Message[]; draft: Draft | null; receipts: Receipt[]; run: Run | null }
export interface TurnInput extends ConversationSettings { requestId: string; content: string }
export interface TurnResult { text: string; proposedRows?: unknown[]; usage?: { inputTokens: number; outputTokens: number }; toolCalls?: number }
export interface BeginTurnResult { started: boolean; state: ConversationState; history: Message[]; pendingRows: DraftRow[] }
