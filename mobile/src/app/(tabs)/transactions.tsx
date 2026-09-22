import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import api, { errorMessage } from '../../lib/api';
import { theme, colorForCategory, elevation } from '../../lib/theme';
import { formatDay } from '../../lib/date';
import { formatMoney, amountOf } from '../../lib/format';
import { remember } from '../../lib/transactionCache';
import type { Transaction, TransactionsResponse } from '../../types/api';

const PAGE_SIZE = 25;

export default function Transactions() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (wanted: number) => {
    const { data } = await api.get<TransactionsResponse>('/transactions', {
      params: { page: wanted, limit: PAGE_SIZE },
    });
    return data;
  }, []);

  const loadFirst = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPage(1);
      remember(data.transactions);
      setItems(data.transactions);
      setPage(data.pagination.page);
      setPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch (e) {
      setError(errorMessage(e, 'Could not load transactions'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage]);

  useFocusEffect(
    useCallback(() => {
      void loadFirst();
    }, [loadFirst]),
  );

  /**
   * Infinite scroll. The demo account holds 192 rows, so this is not
   * decoration — loading them all at once would build 192 views for the ~8
   * a phone can show, which is exactly what FlatList exists to avoid.
   */
  async function loadMore() {
    if (loadingMore || loading || page >= pages) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(page + 1);
      remember(data.transactions);
      setItems((previous) => [...previous, ...data.transactions]);
      setPage(data.pagination.page);
      setPages(data.pagination.pages);
    } catch (e) {
      setError(errorMessage(e, 'Could not load more'));
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.fill}
      contentContainerStyle={styles.content}
      data={items}
      // A stable string key. Using the array index instead would recycle the
      // wrong row into the wrong slot as pages append.
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadFirst();
          }}
        />
      }
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View>
          <Text style={styles.count}>
            {total} {total === 1 ? 'transaction' : 'transactions'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.hint}>No transactions yet. Add one from the Add tab.</Text>
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.footer} /> : null
      }
      renderItem={({ item }) => {
        const income = item.type === 'income';
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/transaction/${item.id}`)}
          >
            <View style={[styles.stripe, { backgroundColor: colorForCategory(item.category) }]} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={styles.rowSub}>
                {item.category} · {formatDay(item.date)}
              </Text>
            </View>
            <Text
              style={[styles.amount, { color: income ? theme.income : theme.expense }]}
            >
              {income ? '+' : '−'}
              {formatMoney(amountOf(item), item.convertedCurrency)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.faint} style={styles.chevron} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 48 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  count: { fontSize: 13, color: theme.muted, marginBottom: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 8,
    ...elevation,
  },
  rowPressed: { opacity: 0.6 },
  // The same colour the donut gives this category, so the list and the chart
  // read as one picture.
  stripe: { width: 3, height: 30, borderRadius: 2, marginRight: 12 },
  chevron: { marginLeft: 8 },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, color: theme.text, fontWeight: '600' },
  rowSub: { fontSize: 12, color: theme.muted, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  error: { color: theme.expense, marginBottom: 12, lineHeight: 20 },
  hint: { color: theme.muted, fontSize: 13, textAlign: 'center', marginTop: 32 },
  footer: { marginVertical: 16 },
});
