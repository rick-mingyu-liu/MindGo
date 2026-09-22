/**
 * One palette, used by every screen.
 *
 * Deliberately static rather than reactive. The web app has a full
 * ThemeContext with light and dark, and mobile has `useColorScheme()` to match
 * the system setting — but making the palette dynamic means no screen can use
 * `StyleSheet.create` at module scope any more, and that indirection is not
 * what this first build is for. Adding dark mode later is a good second
 * exercise; see README.
 */
export const theme = {
  bg: '#f6f7f9',
  card: '#ffffff',
  border: '#e2e5ea',
  text: '#11151c',
  muted: '#6b7280',
  accent: '#2563eb',
  income: '#16a34a',
  expense: '#dc2626',
} as const;
