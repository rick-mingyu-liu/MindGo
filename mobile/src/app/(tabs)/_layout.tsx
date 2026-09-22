import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
        tabBarInactiveTintColor: theme.faint,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.card },
        headerTitleStyle: { color: theme.text, fontSize: 17, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          // The filled/outline pair is the iOS convention: the selected tab
          // is solid, the rest are outlines.
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
