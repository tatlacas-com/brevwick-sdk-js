import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../App';

type Props = StackScreenProps<RootStackParamList, 'Home'>;

export function Home({ navigation }: Props): ReactElement {
  const [lastAction, setLastAction] = useState<string>('—');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Brevwick — RN demo</Text>
      <Text style={styles.body}>
        Tap each button to populate one of the four context streams the SDK
        attaches to every submission, then tap{' '}
        <Text style={styles.bold}>Feedback</Text> to file an issue.
      </Text>

      <Section title="1. Console ring">
        <DemoButton
          label="Throw a test error"
          onPress={() => {
            setLastAction('console.error fired + thrown error caught');
            console.error('[brevwick-rn-example] Demo error from Home screen');
            try {
              throw new Error('Simulated render-path error');
            } catch (err) {
              console.warn('[brevwick-rn-example] Caught:', err);
            }
          }}
        />
      </Section>

      <Section title="2. Network ring">
        <DemoButton
          label="Trigger failed fetch"
          onPress={async () => {
            setLastAction('Failed fetch in flight');
            try {
              await fetch('https://httpbin.org/status/503');
              await fetch('https://this-host-does-not-exist.brevwick.invalid');
            } catch {
              // Expected — example wants the error in the network ring.
            }
            setLastAction('Failed fetch resolved (check network ring)');
          }}
        />
      </Section>

      <Section title="3. Route ring">
        <DemoButton
          label="Navigate to Details"
          onPress={() => {
            setLastAction('Navigated to Details — new route entry');
            navigation.navigate('Details', { from: 'Home' });
          }}
        />
      </Section>

      <Section title="4. Open feedback">
        <Text style={styles.helperText}>
          Use the floating <Text style={styles.bold}>Feedback</Text> button in
          the corner. It opens the composer and submits to your project inbox
          once the form is filled.
        </Text>
      </Section>

      <View style={styles.lastAction}>
        <Text style={styles.lastActionLabel}>Last action:</Text>
        <Text style={styles.lastActionValue}>{lastAction}</Text>
      </View>
    </ScrollView>
  );
}

interface SectionProps {
  title: string;
  children: ReactElement | ReactElement[];
}
function Section({ title, children }: SectionProps): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface DemoButtonProps {
  label: string;
  onPress: () => void;
}
function DemoButton({ label, onPress }: DemoButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 160 },
  heading: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, color: '#334155', lineHeight: 22 },
  bold: { fontWeight: '600', color: '#0f172a' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  helperText: { fontSize: 14, color: '#475569', lineHeight: 20 },
  btn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnLabel: { color: '#fff', fontWeight: '600' },
  lastAction: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  lastActionLabel: { fontSize: 12, color: '#64748b' },
  lastActionValue: { marginTop: 4, fontSize: 14, color: '#0f172a' },
});
