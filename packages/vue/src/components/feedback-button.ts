import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
  type VNode,
} from 'vue';
import type { FeedbackInput, SubmitResult } from '@tatlacas/brevwick-sdk';
import { useFeedback } from '../composables/use-feedback';
import { BREVWICK_CSS, BREVWICK_STYLE_ID } from '../styles';
import { BREVWICK_VUE_VERSION } from '../internal/version';

export type BrevwickTheme = 'light' | 'dark' | 'system';

/**
 * Props accepted by `<FeedbackButton>`. Mirrors the React adapter's
 * `FeedbackButtonProps` so consumers porting between frameworks find the
 * same names. The Vue surface is intentionally trimmed compared to React
 * (no AI toggle, no region overlay) — those land in follow-up issues now
 * that the package shape is established.
 */
export const FeedbackButton = defineComponent({
  name: 'BrevwickFeedbackButton',
  props: {
    position: {
      type: String as PropType<'bottom-right' | 'bottom-left'>,
      default: 'bottom-right',
    },
    disabled: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    label: { type: String, default: 'Feedback' },
    theme: {
      type: String as PropType<BrevwickTheme>,
      default: 'system',
    },
    className: { type: String, default: '' },
    onSubmit: {
      type: Function as PropType<(result: SubmitResult) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const { submit, captureScreenshot, status } = useFeedback();
    const open = ref(false);
    const draft = ref('');
    const screenshotBlob = ref<Blob | null>(null);
    const screenshotUrl = ref<string | null>(null);
    const submitError = ref<string | null>(null);
    const successMessage = ref<string | null>(null);
    const capturing = ref(false);

    onMounted(() => {
      // Inject the bundled <style> once per document. The DOM probe by id
      // is the dedupe — multiple <FeedbackButton>s in one tree still produce
      // one stylesheet, and Fast-Refresh / HMR is robust because we read
      // the live DOM rather than a module-level flag.
      if (typeof document === 'undefined') return;
      if (document.getElementById(BREVWICK_STYLE_ID)) return;
      const el = document.createElement('style');
      el.id = BREVWICK_STYLE_ID;
      el.textContent = BREVWICK_CSS;
      document.head.appendChild(el);
    });

    onBeforeUnmount(() => {
      if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value);
    });

    const fabClass = computed(() => [
      'brw-root',
      'brw-fab',
      props.position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br',
      props.className,
    ]);

    const panelClass = computed(() => [
      'brw-root',
      'brw-panel',
      props.position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br',
      props.className,
    ]);

    const handleOpen = (): void => {
      open.value = true;
      submitError.value = null;
      successMessage.value = null;
    };

    const handleClose = (): void => {
      open.value = false;
    };

    const handleCapture = async (): Promise<void> => {
      capturing.value = true;
      submitError.value = null;
      try {
        const blob = await captureScreenshot();
        if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value);
        screenshotBlob.value = blob;
        screenshotUrl.value = URL.createObjectURL(blob);
      } catch (err) {
        submitError.value =
          err instanceof Error ? err.message : 'Screenshot capture failed';
      } finally {
        capturing.value = false;
      }
    };

    const handleRemoveScreenshot = (): void => {
      if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value);
      screenshotBlob.value = null;
      screenshotUrl.value = null;
    };

    const handleSubmit = async (): Promise<void> => {
      if (status.value === 'submitting') return;
      const text = draft.value.trim();
      if (!text) {
        submitError.value = 'Please describe what happened.';
        return;
      }
      submitError.value = null;
      const input: FeedbackInput = {
        title: (text.split('\n', 1)[0] ?? text).slice(0, 120),
        description: draft.value,
      };
      if (screenshotBlob.value) {
        const ext =
          screenshotBlob.value.type.split('/')[1]?.split('+')[0] || 'webp';
        input.attachments = [
          { blob: screenshotBlob.value, filename: `screenshot.${ext}` },
        ];
      }
      try {
        const result = await submit(input);
        props.onSubmit?.(result);
        if (result.ok) {
          successMessage.value = 'Thanks — your feedback is on its way.';
          draft.value = '';
          handleRemoveScreenshot();
        } else {
          submitError.value = result.error.message;
        }
      } catch (err) {
        submitError.value =
          err instanceof Error && err.message
            ? err.message
            : 'We could not submit your feedback. Please try again.';
      }
    };

    return () => {
      if (props.hidden) return null;
      return h(
        'div',
        { 'data-brevwick-skip': '', 'data-brw-theme': props.theme },
        [
          h(
            'button',
            {
              type: 'button',
              class: fabClass.value,
              disabled: props.disabled,
              'aria-label': 'Open feedback form',
              'data-brevwick-skip': '',
              onClick: handleOpen,
            },
            props.label,
          ),
          open.value ? renderPanel() : null,
        ],
      );
    };

    function renderPanel(): VNode {
      const submitting = status.value === 'submitting';
      const sendDisabled =
        submitting || capturing.value || draft.value.trim().length === 0;
      return h(
        'div',
        {
          class: 'brw-root',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Send feedback',
          'data-brevwick-skip': '',
          'data-brw-theme': props.theme,
        },
        [
          h('div', {
            class: 'brw-backdrop',
            'data-brevwick-skip': '',
            onClick: handleClose,
          }),
          h('div', { class: panelClass.value, 'data-brevwick-skip': '' }, [
            h('div', { class: 'brw-panel-header' }, [
              h('h2', { class: 'brw-panel-title' }, 'Send feedback'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'brw-icon-btn',
                  'aria-label': 'Close',
                  onClick: handleClose,
                },
                '×',
              ),
            ]),
            h('div', { class: 'brw-panel-body' }, [
              h('textarea', {
                class: 'brw-textarea',
                placeholder: 'Describe the bug or feedback…',
                'aria-label': 'Feedback message',
                value: draft.value,
                onInput: (event: Event) => {
                  draft.value = (event.target as HTMLTextAreaElement).value;
                },
              }),
              screenshotUrl.value
                ? h('div', { class: 'brw-chip' }, [
                    h('img', {
                      src: screenshotUrl.value,
                      alt: 'Captured screenshot',
                    }),
                    h('span', 'screenshot'),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'brw-chip-remove',
                        'aria-label': 'Remove screenshot',
                        onClick: handleRemoveScreenshot,
                      },
                      '×',
                    ),
                  ])
                : null,
              submitError.value
                ? h(
                    'div',
                    { class: 'brw-error', role: 'alert' },
                    submitError.value,
                  )
                : null,
              successMessage.value
                ? h('div', { class: 'brw-success' }, successMessage.value)
                : null,
            ]),
            h('div', { class: 'brw-actions' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: 'brw-btn',
                  'aria-label': 'Capture screenshot of this page',
                  disabled: capturing.value || submitting,
                  onClick: handleCapture,
                },
                capturing.value ? 'Capturing…' : 'Screenshot',
              ),
              h('span', { class: 'brw-spacer' }),
              h(
                'button',
                {
                  type: 'button',
                  class: 'brw-btn brw-btn-primary',
                  'aria-label': 'Send',
                  disabled: sendDisabled,
                  onClick: handleSubmit,
                },
                submitting ? 'Sending…' : 'Send',
              ),
            ]),
            h('div', { class: 'brw-footer' }, [
              h(
                'a',
                {
                  class: 'brw-footer-link',
                  href: 'https://brevwick.dev',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                `Brevwick v${BREVWICK_VUE_VERSION}`,
              ),
            ]),
          ]),
        ],
      );
    }
  },
});
