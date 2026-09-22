import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../../lib/auth';
import { theme } from '../../lib/theme';

/**
 * The signed-in area.
 *
 * The guard lives here rather than in each screen, so a tab cannot be reached
 * without a session no matter how it is navigated to — including a deep link
 * straight into /transactions from outside the app.
 */
export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        headerStyle: { backgroundColor: theme.card },
        headerTitleStyle: { color: theme.text },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="add" options={{ title: 'Add' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
