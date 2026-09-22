import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { theme, elevation } from '../lib/theme';

/** The one container every screen uses, so elevation stays consistent. */
export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 12,
    ...elevation,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
});
