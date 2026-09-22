import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { formatDayRange } from '../../lib/date';
import { formatMoney } from '../../lib/format';
import { Card } from '../../components/Card';
import { DonutChart, type Slice } from '../../components/DonutChart';
import { BarChart, type Bar } from '../../components/BarChart';
import { PeriodPicker, PERIODS, type Period } from '../../components/PeriodPicker';
import { categories as CATEGORY_LISTS } from '../../lib/categories';
import type { SummaryResponse } from '../../types/api';

/** Income category names, for splitting the category totals into two charts. */
const INCOME_CATEGORIES = new Set<string>(CATEGORY_LISTS.income);

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [period, setPeriod] = useState<Period>(PERIODS[0]!);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (which: Period) => {
    setError(null);
    try {
      // Exactly one of term/year/months, or the API answers 400.
      const { data } = await api.get<SummaryResponse>('/summary/rolling', {
        params: { [which.param]: which.value },
      });
      setSummary(data);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your summary'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch whenever the tab regains focus, so a transaction added on the Add
  // tab is reflected here without a manual pull. `useEffect` would run once
  // and then never again, because the screen is never unmounted by the tabs.
  useFocusEffect(
    useCallback(() => {
      void load(period);
    }, [load, period]),
  );

  function choose(next: Period) {
    setPeriod(next);
    setLoading(true);
    void load(next);
  }

  const spending: Slice[] = Object.entries(summary?.categories ?? {})
    .filter(([name]) => !INCOME_CATEGORIES.has(name))
    .map(([label, totals]) => ({ label, value: totals.total }))
    .sort((a, b) => b.value - a.value);

  const bars: Bar[] = (summary?.monthlyBreakdown ?? []).map((month) => ({
    // '2026-09' → 'Sep'. Built from the string, never `new Date(month)`,
    // which parses as UTC and names the month before west of UTC.
    label: MONTHS[Number(month.month.slice(5, 7)) - 1] ?? month.month,
    income: month.income,
    expenses: month.expenses,
  }));

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(period);
          }}
        />
      }
    >
      <Text style={styles.greeting}>Hi {user?.first_name}</Text>
      <Text style={styles.period}>{summary?.periodLabel ?? period.label}</Text>
      <Text style={styles.range}>
        {summary ? formatDayRange(summary.startDate, summary.endDate) : ' '}
      </Text>

      <View style={styles.picker}>
        <PeriodPicker selected={period} onSelect={choose} disabled={loading} />
      </View>

      {error ? (
        <Card>
          <Text style={styles.error}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Waking the server can take ~20s</Text>
        </View>
      ) : summary ? (
        <>
          <View style={styles.cards}>
            <Card style={styles.half}>
              <Text style={styles.cardLabel}>Income</Text>
              <Text style={[styles.cardValue, { color: theme.income }]}>
                {formatMoney(summary.totalIncome, summary.targetCurrency)}
              </Text>
            </Card>
            <Card style={styles.half}>
              <Text style={styles.cardLabel}>Expenses</Text>
              <Text style={[styles.cardValue, { color: theme.expense }]}>
                {formatMoney(summary.totalExpenses, summary.targetCurrency)}
              </Text>
            </Card>
          </View>

          <Card>
            <Text style={styles.cardLabel}>Net</Text>
            <View style={styles.netRow}>
              <Ionicons
                name={summary.netIncome >= 0 ? 'trending-up' : 'trending-down'}
                size={22}
                color={summary.netIncome >= 0 ? theme.income : theme.expense}
              />
              <Text
                style={[
                  styles.netValue,
                  { color: summary.netIncome >= 0 ? theme.income : theme.expense },
                ]}
              >
                {formatMoney(summary.netIncome, summary.targetCurrency)}
              </Text>
            </View>
          </Card>

          <Card title="Where it went">
            <DonutChart slices={spending} currency={summary.targetCurrency} />
          </Card>

          <Card title="Month by month">
            <BarChart bars={bars} currency={summary.targetCurrency} />
          </Card>
        </>
      ) : null}

      <Pressable style={styles.signOut} onPress={() => void signOut()}>
        <Ionicons name="log-out-outline" size={18} color={theme.expense} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 48 },
  greeting: { fontSize: 14, color: theme.muted },
  period: { fontSize: 28, fontWeight: '700', color: theme.text, marginTop: 2 },
  range: { fontSize: 13, color: theme.faint, marginBottom: 14, minHeight: 18 },
  picker: { marginBottom: 16 },
  cards: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  cardLabel: {
    fontSize: 11,
    color: theme.muted,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardValue: { fontSize: 20, fontWeight: '700', marginTop: 6 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  netValue: { fontSize: 24, fontWeight: '700' },
  error: { color: theme.expense, lineHeight: 20 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  hint: { color: theme.muted, fontSize: 13 },
  signOut: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 12,
  },
  signOutText: { color: theme.expense, fontSize: 15, fontWeight: '600' },
});
