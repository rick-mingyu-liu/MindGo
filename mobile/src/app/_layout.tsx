import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { theme } from '../lib/theme';

/**
 * The root navigator.
 *
 * Every `_layout.tsx` in this tree defines a navigator, and every other file
 * is a screen — the same file-based routing idea as the web app's Pages
 * Router, which is why `expo-router` is an easy landing here.
 *
 * `SafeAreaProvider` is the first thing mobile asks for that the web never
 * did: phones have notches, status bars and home indicators, and content
 * drawn under them is simply lost.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          {/* Pushed from the transactions list. It gets a header because it
              is a leaf the person has to be able to back out of; the tabs
              draw their own. */}
          <Stack.Screen
            name="transaction/[id]"
            options={{
              headerShown: true,
              title: 'Edit transaction',
              headerBackTitle: 'Back',
              headerStyle: { backgroundColor: theme.card },
              headerTitleStyle: { color: theme.text },
              headerTintColor: theme.accent,
            }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
