import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../lib/auth';

/**
 * The gate. Nothing renders here — it decides where the app opens.
 *
 * While `loading` is true the keychain read is still in flight, and the honest
 * answer to "is anyone signed in?" is "not yet known". Redirecting during that
 * window is what makes an app flash its login screen on every launch.
 */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
