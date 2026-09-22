import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';
import { formatMoney } from '../lib/format';
import type { Currency } from '../types/api';

export interface Bar {
  label: string;
  income: number;
  expenses: number;
}

/**
 * Income against expenses, month by month.
 *
 * Plain Views rather than SVG — a bar is a rectangle, and a rectangle is
 * what a View already is. Heights are percentages of the tallest bar, so
 * the chart scales itself to whatever the window holds.
 */
export function BarChart({ bars, currency }: { bars: Bar[]; currency: Currency }) {
  if (bars.length === 0) {
    return <Text style={styles.empty}>No months in this window yet.</Text>;
  }

  // One shared scale across both series, or income and expense bars would
  // each be normalised to their own maximum and could not be compared.
  const peak = Math.max(...bars.flatMap((b) => [b.income, b.expenses]), 1);

  return (
    <View>
      <View style={styles.plot}>
        {bars.map((bar) => (
          <View key={bar.label} style={styles.column}>
            <View style={styles.pair}>
              <View
                style={[
                  styles.bar,
                  { height: `${(bar.income / peak) * 100}%`, backgroundColor: theme.income },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  { height: `${(bar.expenses / peak) * 100}%`, backgroundColor: theme.expense },
                ]}
              />
            </View>
            <Text style={styles.columnLabel} numberOfLines={1}>
              {bar.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.key}>
        <View style={styles.keyItem}>
          <View style={[styles.dot, { backgroundColor: theme.income }]} />
          <Text style={styles.keyText}>Income</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={[styles.dot, { backgroundColor: theme.expense }]} />
          <Text style={styles.keyText}>Expenses</Text>
        </View>
        <Text style={styles.peak}>peak {formatMoney(peak, currency)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 10 },
  column: { flex: 1, alignItems: 'center', height: '100%' },
  pair: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 11, borderRadius: 3, minHeight: 2 },
  columnLabel: { fontSize: 10, color: theme.faint, marginTop: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  keyText: { fontSize: 12, color: theme.muted },
  peak: { fontSize: 11, color: theme.faint, marginLeft: 'auto' },
  empty: { color: theme.muted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
