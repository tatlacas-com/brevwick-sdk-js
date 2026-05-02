import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFeedback } from '@tatlacas/brevwick-react-native';

export interface FeedbackFabProps {
  /**
   * When false, render a disabled banner-style FAB instead of opening the
   * modal — the example's `App.tsx` wires this to whether
   * `EXPO_PUBLIC_BREVWICK_PROJECT_KEY` parses as a real `pk_test_…`. The
   * provider itself is passed `enabled: false` in that case so the SDK is
   * a no-op; this is purely for the user-facing affordance.
   */
  keyReady: boolean;
}

/**
 * Inline replacement for `<FeedbackButton />` — the real drop-in component
 * lands with #88. Until it does, the example demonstrates the same UX (and
 * the same `useFeedback()` plumbing the canonical button uses internally)
 * with a hand-rolled `<Pressable>` + RN `<Modal>` pair.
 */
export function FeedbackFab({ keyReady }: FeedbackFabProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const { submit, status, error, reset } = useFeedback();
  // Hold the post-success dismiss timer so we can cancel it on unmount or
  // on early Cancel — without this, the timer would fire after teardown
  // and call `reset()` / `setOpen(false)` against a stale render tree.
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimeoutRef.current !== null) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
    },
    [],
  );

  function clearDismissTimer(): void {
    if (dismissTimeoutRef.current !== null) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }

  async function handleSubmit(): Promise<void> {
    // `useFeedback().status` is the single source of truth for an in-flight
    // submission — re-shadowing it with a local ref would just risk drift.
    if (status === 'submitting' || !description.trim()) return;
    const result = await submit({ description });
    if (result.ok) {
      setDescription('');
      clearDismissTimer();
      dismissTimeoutRef.current = setTimeout(() => {
        dismissTimeoutRef.current = null;
        setOpen(false);
        reset();
      }, 1500);
    }
  }

  function handleCancel(): void {
    clearDismissTimer();
    setOpen(false);
    setDescription('');
    reset();
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        accessibilityState={{ disabled: !keyReady }}
        onPress={keyReady ? () => setOpen(true) : undefined}
        style={[styles.fab, keyReady ? styles.fabReady : styles.fabDisabled]}
      >
        <Text style={styles.fabLabel}>
          {keyReady ? 'Feedback' : 'Set EXPO_PUBLIC_BREVWICK_PROJECT_KEY'}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent
        visible={open}
        onRequestClose={handleCancel}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send feedback</Text>
            <TextInput
              accessibilityLabel="Feedback description"
              style={styles.input}
              multiline
              placeholder="What happened?"
              value={description}
              onChangeText={setDescription}
              editable={status !== 'submitting'}
            />
            {status === 'success' && (
              <Text style={styles.successText}>
                Thanks! Filed to your inbox.
              </Text>
            )}
            {status === 'error' && error && (
              <Text style={styles.errorText}>{error.message}</Text>
            )}
            <View style={styles.row}>
              <Pressable
                onPress={handleCancel}
                style={[styles.btn, styles.btnGhost]}
              >
                <Text style={styles.btnGhostLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={status === 'submitting' || !description.trim()}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  (status === 'submitting' || !description.trim()) &&
                    styles.btnDisabled,
                ]}
              >
                <Text style={styles.btnPrimaryLabel}>
                  {status === 'submitting' ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 48,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabReady: { backgroundColor: '#7c3aed' },
  fabDisabled: { backgroundColor: '#94a3b8' },
  fabLabel: { color: '#fff', fontWeight: '600' },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostLabel: { color: '#0f172a', fontWeight: '500' },
  btnPrimary: { backgroundColor: '#7c3aed' },
  btnPrimaryLabel: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  successText: { marginTop: 12, color: '#15803d' },
  errorText: { marginTop: 12, color: '#b91c1c' },
});
