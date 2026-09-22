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
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { theme } from '../../lib/theme';
import { formatDayRange } from '../../lib/date';
import { formatMoney } from '../../lib/format';
import type { SummaryResponse } from '../../types/api';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `term=current` is the API's own default and the same window the web
      // dashboard opens on, so both clients agree about what "this term" is.
      const { data } = await api.get<SummaryResponse>('/summary/rolling', {
        params: { term: 'current' },
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
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Waking the server can take ~20s</Text>
      </View>
    );
  }

  const categories = Object.entries(summary?.categories ?? {}).sort(
    (a, b) => b[1].total - a[1].total,
  );

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.greeting}>Hi {user?.first_name}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {summary ? (
        <>
          {/* Every one of these labels is computed by the server. Rendering
              them rather than deriving them is what keeps this client from
              disagreeing with the web one about where a term begins. */}
          <Text style={styles.period}>{summary.periodLabel}</Text>
          <Text style={styles.range}>
            {formatDayRange(summary.startDate, summary.endDate)}
          </Text>

          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Income</Text>
              <Text style={[styles.cardValue, { color: theme.income }]}>
                {formatMoney(summary.totalIncome, summary.targetCurrency)}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Expenses</Text>
              <Text style={[styles.cardValue, { color: theme.expense }]}>
                {formatMoney(summary.totalExpenses, summary.targetCurrency)}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Net</Text>
            <Text
              style={[
                styles.cardValue,
                { color: summary.netIncome >= 0 ? theme.income : theme.expense },
              ]}
            >
              {formatMoney(summary.netIncome, summary.targetCurrency)}
            </Text>
          </View>

          <Text style={styles.section}>By category</Text>
          {categories.length === 0 ? (
            <Text style={styles.hint}>Nothing recorded this term yet.</Text>
          ) : (
            categories.map(([name, totals]) => (
              <View key={name} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{name}</Text>
                  <Text style={styles.rowSub}>
                    {totals.count} {totals.count === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>
                  {formatMoney(totals.total, summary.targetCurrency)}
                </Text>
              </View>
            ))
          )}
        </>
      ) : null}

      <Pressable style={styles.signOut} onPress={() => void signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 48 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.bg },
  greeting: { fontSize: 15, color: theme.muted },
  period: { fontSize: 28, fontWeight: '700', color: theme.text, marginTop: 2 },
  range: { fontSize: 13, color: theme.muted, marginBottom: 16 },
  cards: { flexDirection: 'row', gap: 12 },
  card: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  cardValue: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 13, fontWeight: '700', color: theme.muted, marginTop: 12, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 15, color: theme.text, fontWeight: '600' },
  rowSub: { fontSize: 12, color: theme.muted, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: theme.text },
  error: { color: theme.expense, marginVertical: 12, lineHeight: 20 },
  hint: { color: theme.muted, fontSize: 13 },
  signOut: { marginTop: 28, alignItems: 'center', padding: 12 },
  signOutText: { color: theme.expense, fontSize: 15, fontWeight: '600' },
});
