import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import api, { errorMessage } from '../../lib/api';
import { theme } from '../../lib/theme';
import { categories } from '../../lib/categories';
import { formatDay } from '../../lib/date';
import { recall, forget } from '../../lib/transactionCache';
import type { TransactionType } from '../../types/api';

export default function EditTransaction() {
  // Route params are always strings — `/transaction/12` gives '12', never 12.
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);
  const existing = Number.isFinite(numericId) ? recall(numericId) : undefined;

  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? categories.expense[0]);
  const [day, setDay] = useState(existing?.date ?? '');
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!existing) {
    // The cache is empty on a cold start, so this is what a deep link hits.
    return (
      <View style={styles.centre}>
        <Ionicons name="help-circle-outline" size={40} color={theme.faint} />
        <Text style={styles.missingTitle}>Nothing loaded for #{id}</Text>
        <Text style={styles.missingBody}>
          Open a transaction from the list. The API has no endpoint to fetch one
          by id, so the row has to come from a list the app already loaded.
        </Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  function chooseType(next: TransactionType) {
    setType(next);
    if (!categories[next].includes(category)) setCategory(categories[next][0]!);
  }

  async function save() {
    if (busy) return;
    setError(null);

    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value < 0.01) {
      setError('Enter an amount of at least 0.01');
      return;
    }
    if (!description.trim()) {
      setError('Enter a description');
      return;
    }

    setBusy(true);
    try {
      // PUT takes the whole row, not a patch — the same validation chain as
      // POST runs on it, so every field has to be present and valid.
      await api.put(`/transactions/${numericId}`, {
        amount: value,
        description: description.trim(),
        category,
        type,
        date: day,
        currency: existing!.currency,
      });
      forget(numericId);
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Could not save that'));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    // A native confirm, not a custom sheet: destructive actions are one of
    // the few places the platform dialog is the right answer, and iOS styles
    // the destructive button red for free.
    Alert.alert('Delete this transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/transactions/${numericId}`);
      forget(numericId);
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Could not delete that'));
      setBusy(false);
    }
  }

  const options = categories[type];

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {(['expense', 'income'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => chooseType(option)}
              style={[styles.segmentItem, type === option && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, type === option && styles.segmentTextActive]}>
                {option === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Amount ({existing.currency})</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          maxLength={255}
          editable={!busy}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {options.map((name) => (
            <Pressable
              key={name}
              onPress={() => setCategory(name)}
              style={[styles.chip, category === name && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === name && styles.chipTextActive]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Date</Text>
        <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
          <Text style={styles.inputText}>{formatDay(day)}</Text>
        </Pressable>
        {showPicker ? (
          <DateTimePicker
            value={new Date(`${day}T12:00:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event, selected) => {
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (event.type === 'dismissed' || !selected) return;
              const pad = (n: number) => String(n).padStart(2, '0');
              setDay(
                `${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}`,
              );
            }}
          />
        ) : null}
        {showPicker && Platform.OS === 'ios' ? (
          <Pressable onPress={() => setShowPicker(false)} style={styles.doneRow}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
          onPress={save}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save changes</Text>}
        </Pressable>

        <Pressable style={styles.delete} onPress={confirmDelete} disabled={busy}>
          <Ionicons name="trash-outline" size={18} color={theme.expense} />
          <Text style={styles.deleteText}>Delete transaction</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 64 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
    padding: 32,
    gap: 10,
  },
  missingTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  missingBody: { fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentItemActive: { backgroundColor: theme.card },
  segmentText: { fontSize: 14, fontWeight: '600', color: theme.muted },
  segmentTextActive: { color: theme.text },
  label: { fontSize: 13, fontWeight: '600', color: theme.muted, marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
    justifyContent: 'center',
    minHeight: 48,
  },
  inputText: { fontSize: 16, color: theme.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 13, color: theme.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: theme.expense, marginTop: 16, lineHeight: 20 },
  doneRow: { alignItems: 'flex-end', paddingVertical: 8 },
  doneText: { color: theme.accent, fontWeight: '600', fontSize: 15 },
  button: {
    marginTop: 24,
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  delete: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 12,
  },
  deleteText: { color: theme.expense, fontSize: 15, fontWeight: '600' },
});
