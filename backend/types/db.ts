/**
 * One interface per table in db/schema.sql, written by hand. Update this file
 * in the same commit as any schema.sql edit or migration.
 *
 * How node-pg hands columns back here:
 * - DATE is the plain string '2026-08-28' (the type parser in db/connection);
 * - DECIMAL is a string ('12.50'), because pg does not parse it;
 * - TIMESTAMP is a Date;
 * - a column without NOT NULL can be null.
 */

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  email_verified: boolean | null;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
  language: string;
  email_notifications_enabled: boolean;
  weekly_reports_enabled: boolean;
  is_demo: boolean;
}

export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'ocr' | 'ocr_llm';

export interface TransactionRow {
  id: number;
  user_id: number | null;
  amount: string;
  description: string;
  category: string;
  type: TransactionType;
  date: string;
  currency: string;
  source: TransactionSource;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface ImportBatchRow {
  id: number;
  user_id: number | null;
  row_count: number;
  edited_count: number;
  llm_count: number;
  created_at: Date | null;
}

export interface SavingsGoalRow {
  id: number;
  user_id: number | null;
  name: string;
  target_amount: string;
  current_amount: string | null;
  target_date: string | null;
  description: string | null;
  currency: string;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface WatchlistRow {
  id: number;
  user_id: number | null;
  symbol: string;
  company_name: string | null;
  added_at: Date | null;
}

export interface AiPlanRow {
  id: number;
  user_id: number | null;
  prompt: string;
  response: string;
  created_at: Date | null;
}
