import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';

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
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
