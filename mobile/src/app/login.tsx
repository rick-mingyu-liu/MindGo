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
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { theme } from '../lib/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('john.doe@example.com');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Without this the keyboard covers the password field and the button on
    // any phone smaller than a Pro Max. The web never has to think about it.
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>MindGo</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          // These four props are the whole difference between a usable and an
          // infuriating mobile form: the right keyboard, no auto-capitalised
          // first letter, no autocorrect mangling the address, and a Return
          // key that submits.
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          placeholder="you@example.com"
          placeholderTextColor={theme.muted}
          editable={!busy}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          placeholder="••••••••"
          placeholderTextColor={theme.muted}
          editable={!busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (busy || pressed) && styles.buttonPressed,
          ]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Pre-filled with the demo account. The backend is on Render&apos;s free
            plan, so the first sign-in after a quiet spell can take ~20 seconds
            while the server wakes up.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 6 },
  title: { fontSize: 34, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 15, color: theme.muted, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: theme.muted, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
  },
  error: {
    color: theme.expense,
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
  },
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
  note: { marginTop: 28 },
  noteText: { color: theme.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
