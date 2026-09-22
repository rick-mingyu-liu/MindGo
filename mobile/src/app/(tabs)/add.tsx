import { useState } from 'react';
import {
  ActivityIndicator,
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
import { router } from 'expo-router';
import api, { errorMessage } from '../../lib/api';
import { theme } from '../../lib/theme';
import { categories } from '../../lib/categories';
import { formatDay, todayDay } from '../../lib/date';
import type { TransactionType } from '../../types/api';

export default function Add() {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories.expense[0]);
  const [day, setDay] = useState(todayDay());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const options = categories[type];

  function chooseType(next: TransactionType) {
    setType(next);
    // The category lists are disjoint, so a leftover 'Groceries' on an income
    // entry would be sent to an API that accepts any string and stores it.
    setCategory(categories[next][0]);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    setDone(null);

    const value = Number.parseFloat(amount);
    // The server validates all of this too (isFloat min 0.01, notEmpty). This
    // check exists so the person is told immediately rather than after a
    // round trip that may take 20 seconds on a cold server.
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
      await api.post('/transactions', {
        amount: value,
        description: description.trim(),
        category,
        type,
        date: day,
        currency: 'CAD',
      });
      setAmount('');
      setDescription('');
      setDone('Saved');
      router.push('/(tabs)/transactions');
    } catch (e) {
      setError(errorMessage(e, 'Could not save that'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {(['expense', 'income'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => chooseType(option)}
              style={[styles.segmentItem, type === option && styles.segmentItemActive]}
            >
              <Text
                style={[styles.segmentText, type === option && styles.segmentTextActive]}
              >
                {option === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Amount (CAD)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          // `decimal-pad` rather than `numeric`: it omits the letters and the
          // minus sign, neither of which can produce a valid amount here.
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.muted}
          editable={!busy}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Coffee with the team"
          placeholderTextColor={theme.muted}
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
            // The picker deals in Date objects but the API deals in days, so
            // the conversion happens here and nowhere else. Building the Date
            // at local noon keeps a timezone shift from moving it a day.
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
        {done ? <Text style={styles.done}>{done}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonPressed]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save transaction</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 64 },
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
  done: { color: theme.income, marginTop: 16, fontWeight: '600' },
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
});
