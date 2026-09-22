import { Platform } from 'react-native';

/**
 * One palette, used by every screen.
 *
 * Deliberately static rather than reactive. The web app has a full
 * ThemeContext with light and dark, and mobile has `useColorScheme()` to
 * match the system setting — but making the palette dynamic means no screen
 * can use `StyleSheet.create` at module scope any more, and that indirection
 * is not what this build is for yet. See README for that as an exercise.
 */
export const theme = {
  bg: '#f6f7f9',
  card: '#ffffff',
  border: '#e2e5ea',
  text: '#11151c',
  muted: '#6b7280',
  faint: '#9aa1ac',
  accent: '#2563eb',
  accentSoft: '#eff4ff',
  income: '#16a34a',
  expense: '#dc2626',
} as const;

/**
 * Card elevation, which behaves differently on each platform: iOS draws a
 * real shadow from these four properties, Android only understands
 * `elevation`. Setting both is the normal way to get one look on both.
 */
export const elevation = Platform.select({
  ios: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
  default: {},
});

/**
 * Category colours, copied from CATEGORY_COLORS in
 * frontend/pages/index.tsx — including the hash fallback, so an unlisted
 * category gets the same colour on the phone as in the browser.
 *
 * This copy is pinned by backend/test/sharedContracts.test.ts, which fails
 * if this map and the frontend's stop agreeing.
 */
const CATEGORY_COLORS: Record<string, string> = {
  // Expenses
  Groceries: '#f59e0b',
  'Dining Out': '#e11d48',
  Transportation: '#06b6d4',
  Housing: '#3b82f6',
  Utilities: '#ef4444',
  Entertainment: '#8b5cf6',
  Shopping: '#ec4899',
  Healthcare: '#f97316',
  Education: '#14b8a6',
  Travel: '#6366f1',
  Savings: '#64748b',
  'Other Expenses': '#a16207',
  // Income
  Salary: '#22c55e',
  Freelance: '#a855f7',
  'Investment Returns': '#84cc16',
  Business: '#0ea5e9',
  'Tax Refund': '#15803d',
  'Other Income': '#10b981',
};

const FALLBACK_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];

/** A stable colour for any category, listed or not. */
export function colorForCategory(name: string): string {
  const known = CATEGORY_COLORS[name];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] as string;
}
