import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../App';

type Props = StackScreenProps<RootStackParamList, 'Details'>;

export function Details({ navigation, route }: Props): ReactElement {
  const from = route.params?.from ?? 'unknown';
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Details</Text>
      <Text style={styles.body}>
        Arrived from <Text style={styles.bold}>{from}</Text>. The route ring now
        has two entries — pop back, then open feedback to verify both are listed
        under <Text style={styles.bold}>route_trail</Text> on the dashboard.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Home"
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnLabel}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  heading: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, color: '#334155', lineHeight: 22 },
  bold: { fontWeight: '600', color: '#0f172a' },
  btn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnLabel: { color: '#fff', fontWeight: '600' },
});
