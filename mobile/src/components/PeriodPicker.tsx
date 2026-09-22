import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { theme } from '../lib/theme';

/**
 * The four windows the web dashboard offers, and the query each one sends.
 *
 * `/summary/rolling` takes **exactly one** of `term`, `year` or `months` —
 * sending two is a 400 — so a period is modelled as the single parameter it
 * maps to rather than as a set of fields.
 */
export type Period = { key: string; label: string; param: 'term' | 'year'; value: string };

export const PERIODS: Period[] = [
  { key: 'term-current', label: 'This term', param: 'term', value: 'current' },
  { key: 'term-previous', label: 'Last term', param: 'term', value: 'previous' },
  { key: 'year-current', label: 'This year', param: 'year', value: 'current' },
  { key: 'year-previous', label: 'Last year', param: 'year', value: 'previous' },
];

export function PeriodPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: Period;
  onSelect: (period: Period) => void;
  disabled?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PERIODS.map((period) => {
        const active = period.key === selected.key;
        return (
          <Pressable
            key={period.key}
            onPress={() => onSelect(period)}
            disabled={disabled}
            style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{period.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipDisabled: { opacity: 0.5 },
  text: { fontSize: 13, color: theme.text, fontWeight: '500' },
  textActive: { color: '#fff', fontWeight: '600' },
});
