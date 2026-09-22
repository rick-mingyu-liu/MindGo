import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { theme, colorForCategory } from '../lib/theme';
import { formatMoney } from '../lib/format';
import type { Currency } from '../types/api';

export interface Slice {
  label: string;
  value: number;
}

/**
 * Spending by category, as a donut.
 *
 * Drawn with one `Circle` per slice rather than arc paths: give every
 * circle the same radius and a `strokeDasharray` of [its share, the rest],
 * then rotate each one past the slices before it. The browser trick works
 * identically in react-native-svg, and it avoids hand-writing arc maths.
 *
 * A chart library would do this too, but every one worth using either pulls
 * in Skia (which Expo Go does not bundle) or a native gradient module. This
 * is ~60 lines and runs anywhere.
 */
export function DonutChart({
  slices,
  currency,
  size = 180,
  thickness = 26,
}: {
  slices: Slice[];
  currency: Currency;
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return <Text style={styles.empty}>Nothing to chart yet.</Text>;
  }

  // The cumulative offset each slice starts at, worked out before render
  // rather than by mutating a counter inside .map(). Accumulating during
  // render reads fine but breaks under the React Compiler, which may
  // memoise or reorder the mapped children.
  const arcs = slices.reduce<{ label: string; dash: number; offset: number }[]>(
    (acc, slice) => {
      const swept = acc.reduce((sum, a) => sum + a.dash, 0);
      acc.push({
        label: slice.label,
        dash: circumference * (slice.value / total),
        offset: -swept,
      });
      return acc;
    },
    [],
  );

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Rotated so the first slice starts at twelve o'clock rather than
              at three, which is where SVG angles begin. */}
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            {arcs.map((arc) => (
              <Circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colorForCategory(arc.label)}
                strokeWidth={thickness}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={arc.offset}
                fill="none"
              />
            ))}
          </G>
        </Svg>
        <View style={[styles.centre, { width: size, height: size }]} pointerEvents="none">
          <Text style={styles.centreLabel}>Total</Text>
          <Text style={styles.centreValue}>{formatMoney(total, currency)}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((slice) => (
          <View key={slice.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: colorForCategory(slice.label) }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.legendValue}>
              {Math.round((slice.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16 },
  centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  centreLabel: { fontSize: 11, color: theme.muted, fontWeight: '600', letterSpacing: 0.5 },
  centreValue: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 2 },
  legend: { alignSelf: 'stretch', gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: theme.text },
  legendValue: { fontSize: 13, color: theme.muted, fontWeight: '600' },
  empty: { color: theme.muted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
