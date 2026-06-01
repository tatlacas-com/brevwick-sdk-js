import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
  type VNode,
} from 'vue';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useFeedback, type FeedbackPhase } from '../composables/use-feedback';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from '../styles';
import { BREVWICK_VUE_VERSION } from '../internal/version';
import { BREVWICK_INJECTION_KEY } from '../plugin';

/**
 * Forced-palette choice for {@link FeedbackButton}. `'system'` defers to the
 * OS-level `prefers-color-scheme` media query (the default and pre-existing
 * behaviour); `'light'` / `'dark'` override it regardless of the OS setting.
 */
export type BrevwickTheme = 'light' | 'dark' | 'system';

/**
 * Stable snapshot of one attachment that rode along with a submit. We store
 * only the underlying `Blob`, mirroring the React adapter's `MessageAttachment`
 * — bubble previews are forward-compat only; the V1 Vue widget renders text.
 */
interface MessageAttachment {
  readonly blob: Blob;
  readonly filename?: string;
}

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
 */
interface Message {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sentAt?: number;
  issueSent?: boolean;
  attachments?: {
    files?: readonly MessageAttachment[];
  };
  /**
   * The exact, post-redaction payload the SDK POSTed for this message — set
   * only when the host enabled `config.debug`. When present, the bubble
   * renders a "copy raw payload" affordance so a developer can inspect
   * everything that left the device (rings/context the widget never shows).
   */
  rawPayload?: Record<string, unknown>;
}

/**
 * Combined attachment cap mirrored from the SDK's `MAX_ATTACHMENT_COUNT`.
 * V1 Vue does not capture screenshots through the widget UI (the toggle and
 * region overlay are React-only for now), so this is a file-only ceiling.
 */
const MAX_ATTACHMENTS = 5;

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! Tell us what's happening. A screenshot helps if you have one.",
};

const initialMessages = (): Message[] => [GREETING_MESSAGE];

const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';

/**
 * Phase ordinal used by the staged-status rows to decide visibility. Row
 * 1 ("Captured") shows from `'sanitising'` onwards, row 2 ("Sanitised")
 * from `'formatting'` onwards. Row 3 ("Formatting with AI") has its own
 * exact-match rule and does not consult this table.
 */
const PHASE_RANK: Record<FeedbackPhase, number> = {
  idle: 0,
  capturing: 1,
  sanitising: 2,
  formatting: 3,
  sent: 4,
  error: -1,
};

/**
 * Stagger between staged-status rows in milliseconds. Applied as
 * `animation-delay` per row (the rows mount with a CSS @keyframes
 * entrance, not a transition) so the rows fade in sequentially even
 * when the underlying SDK phase events fire microseconds apart.
 */
const STATUS_ROW_STAGGER_MS = 200;

interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectConfigState {
  status: ProjectConfigStatus;
  config: ProjectConfig | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * doesn't auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters.
 */
function formatRelativeTime(ms: number | undefined): string {
  if (ms === undefined) return 'just now';
  const diffMs = Date.now() - ms;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Brevwick feedback widget — a FAB plus a panel-based submission form.
 *
 * Mirrors the React adapter's `<FeedbackButton>` UX (panel header with
 * minimize/close, conversation thread with assistant + user bubbles, autogrow
 * composer, AI toggle when project policy permits, staged-status rows driven
 * by the SDK's phase bus, retry row on failure). Screenshot capture lives
 * behind a future-flag — `captureScreenshot` is exposed by the composable
 * but the Vue v1 widget does not render the trigger button. See SDD § 12.
 *
 * ## Theming
 *
 * Set `--brw-*` CSS custom properties on any ancestor (e.g. `:root`) to
 * re-theme the widget without a rebuild. Each adapter ships its own copy
 * of the canonical `BREVWICK_CSS` for now.
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
    theme: { type: String as PropType<BrevwickTheme>, default: 'system' },
    className: { type: String, default: '' },
    onSubmit: {
      type: Function as PropType<(result: SubmitResult) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const { submit, status, phase, error: submitErrorTagged } = useFeedback();
    // Reach the SDK directly (not via the composable) for `getConfig()` —
    // the composable exposes only the submission primitives, and lifting
    // getConfig into it would break the React-symmetric surface. The
    // plugin guarantees a non-null instance reaches descendants here.
    const sdk = inject(BREVWICK_INJECTION_KEY, undefined);

    const open = ref(false);
    const draft = ref('');
    const expected = ref('');
    const actual = ref('');
    const showExtras = ref(false);
    const files = ref<FileAttachment[]>([]);
    const confirmClose = ref(false);
    const submitError = ref<string | null>(null);
    const messages = ref<Message[]>(initialMessages());
    // Submitter's per-issue AI preference. Defaults to true so the toggle
    // renders "on" the first time; only read on submit when the render-
    // policy matrix below says the toggle should be visible.
    const useAi = ref(true);
    const reducedMotion = ref(false);

    const projectConfig = ref<ProjectConfigState>({
      status: 'idle',
      config: null,
    });

    // Mirrors React's `mountedRef` — flipped false in onUnmounted so an
    // in-flight submit / config fetch that resolves after teardown can't
    // mutate refs on a torn-down tree.
    let mounted = true;
    let configTriggered = false;
    let fileIdCounter = 0;
    let messageIdCounter = 0;
    // Snapshot of the last `FeedbackInput` passed to `submit()` so the
    // retry CTA can re-run with the exact same payload (including any
    // attached files) without forcing the user to re-type the draft.
    let lastSubmittedInput: FeedbackInput | null = null;
    // Id of the user bubble for the most recent submit, so the retry path can
    // re-attach a freshly composed `rawPayload` to the same bubble.
    let lastUserMessageId: string | null = null;

    const composerRef = ref<HTMLTextAreaElement | null>(null);
    const keepBtnRef = ref<HTMLButtonElement | null>(null);
    // Per-instance id for the disclosure aria-controls — rendering multiple
    // <FeedbackButton>s mid-animation would otherwise collide on a shared id.
    const disclosurePanelId = `brw-disclosure-${Math.random().toString(36).slice(2, 10)}`;

    onMounted(() => {
      // Inject the bundled <style> once per document. The DOM probe by id
      // is the dedupe — multiple <FeedbackButton>s in one tree still produce
      // one stylesheet, robust under HMR.
      if (typeof document !== 'undefined') {
        if (!document.getElementById(BREVWICK_STYLE_ID)) {
          const el = document.createElement('style');
          el.id = BREVWICK_STYLE_ID;
          el.textContent = BREVWICK_CSS;
          document.head.appendChild(el);
        }
      }
      // Read prefers-reduced-motion at mount only — the spec is an at-render
      // snapshot, and a user that toggles the OS setting mid-submit will
      // pick up the new value on the next interaction (or panel open).
      if (typeof window !== 'undefined' && window.matchMedia) {
        reducedMotion.value = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
      }
    });

    onBeforeUnmount(() => {
      mounted = false;
      if (copiedRawTimeout) clearTimeout(copiedRawTimeout);
    });

    const showAiToggle = computed(
      () =>
        projectConfig.value.status === 'ready' &&
        projectConfig.value.config?.ai_enabled === true &&
        projectConfig.value.config?.ai_submitter_choice_allowed === true,
    );

    const aiEnabled = computed(
      () => projectConfig.value.config?.ai_enabled === true,
    );

    const attachmentCount = computed(() => files.value.length);
    const attachmentsAtCap = computed(
      () => attachmentCount.value >= MAX_ATTACHMENTS,
    );

    const hasContent = computed(
      () =>
        draft.value.trim().length > 0 ||
        expected.value.length > 0 ||
        actual.value.length > 0 ||
        files.value.length > 0,
    );

    const fabPosClass = computed(() =>
      props.position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br',
    );
    const panelPosClass = computed(() =>
      props.position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br',
    );
    const rootClassName = computed(() =>
      ['brw-root', props.className].filter(Boolean).join(' '),
    );

    function maybeFetchConfig(): void {
      if (configTriggered) return;
      if (!sdk) return;
      // Defensive: a Brevwick instance should always carry `getConfig`,
      // but a third-party shim (or a test mock that doesn't stamp it)
      // would otherwise crash the open-panel flow. Stay in idle so the
      // widget renders without the AI toggle and without staged-status
      // surface degradation.
      if (typeof sdk.getConfig !== 'function') return;
      configTriggered = true;
      projectConfig.value = { status: 'loading', config: null };
      sdk
        .getConfig()
        .then((config) => {
          if (!mounted) return;
          projectConfig.value = { status: 'ready', config };
        })
        .catch(() => {
          if (!mounted) return;
          // getConfig never rejects in the documented contract, but stay
          // defensive so a future regression cannot wedge the widget in
          // 'loading' forever.
          projectConfig.value = { status: 'error', config: null };
        });
    }

    function resetAll(): void {
      draft.value = '';
      expected.value = '';
      actual.value = '';
      showExtras.value = false;
      files.value = [];
      confirmClose.value = false;
      submitError.value = null;
      messages.value = initialMessages();
      useAi.value = true;
      lastSubmittedInput = null;
    }

    function handleFullClose(): void {
      open.value = false;
      resetAll();
    }

    function handleMinimize(): void {
      open.value = false;
      confirmClose.value = false;
      submitError.value = null;
    }

    function handleOpen(): void {
      open.value = true;
      submitError.value = null;
      maybeFetchConfig();
    }

    function handleCloseClick(): void {
      if (hasContent.value) {
        confirmClose.value = true;
        // Move focus to "Keep" once the confirm renders so a keyboard user
        // can dismiss with Enter without tabbing through chrome.
        void nextTick(() => {
          keepBtnRef.value?.focus();
        });
        return;
      }
      handleFullClose();
    }

    function handleFiles(list: FileList | null): void {
      if (!list || list.length === 0) return;
      const remaining = MAX_ATTACHMENTS - files.value.length;
      if (remaining <= 0) return;
      const next: FileAttachment[] = [];
      for (let i = 0; i < Math.min(list.length, remaining); i++) {
        const file = list[i]!;
        next.push({ id: ++fileIdCounter, file });
      }
      files.value = [...files.value, ...next];
    }

    function removeFile(id: number): void {
      files.value = files.value.filter((f) => f.id !== id);
    }

    function autosizeComposer(): void {
      const el = composerRef.value;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
    }

    watch(draft, () => {
      void nextTick(autosizeComposer);
    });

    /**
     * Stamp the dev-only raw payload onto a user bubble once `submit()`
     * resolves. No-op unless the host enabled `config.debug` (the SDK only
     * populates `result.debug` then), so this is inert in production.
     */
    function attachRawPayload(messageId: string, result: SubmitResult): void {
      const payload = result.debug?.payload;
      if (!payload) return;
      messages.value = messages.value.map((m) =>
        m.id === messageId ? { ...m, rawPayload: payload } : m,
      );
    }

    // Id of the bubble whose copy button is showing "Copied!" feedback.
    // Single ref keyed by message id avoids per-button component state in the
    // functional render below.
    const copiedRawId = ref<string | null>(null);
    let copiedRawTimeout: ReturnType<typeof setTimeout> | undefined;

    /**
     * Copy the dev-only raw payload (the exact, post-redaction JSON body
     * POSTed to the ingest endpoint) to the clipboard. Pretty-printed with
     * two-space indent; the content is identical to the wire bytes. Degrades
     * to a no-op where the async clipboard API is missing.
     */
    function copyRaw(message: Message): void {
      if (!message.rawPayload) return;
      const json = JSON.stringify(message.rawPayload, null, 2);
      const clip =
        typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip) return;
      void clip.writeText(json).then(
        () => {
          copiedRawId.value = message.id;
          if (copiedRawTimeout) clearTimeout(copiedRawTimeout);
          copiedRawTimeout = setTimeout(() => {
            copiedRawId.value = null;
          }, 1500);
        },
        () => {
          /* clipboard write rejected (permissions) — leave the label as is */
        },
      );
    }

    async function doSubmit(): Promise<void> {
      if (status.value === 'submitting') return;
      if (!draft.value.trim()) {
        submitError.value = 'Please describe what happened.';
        return;
      }
      submitError.value = null;

      const attachments: Array<Blob | FeedbackAttachment> = [];
      for (const { file } of files.value) {
        attachments.push({ blob: file, filename: file.name });
      }

      const derivedTitle = draft.value.trim().split('\n', 1)[0]!.slice(0, 120);
      const input: FeedbackInput = {
        title: derivedTitle,
        description: draft.value,
        expected: expected.value.trim() || undefined,
        actual: actual.value.trim() || undefined,
        attachments: attachments.length ? attachments : undefined,
        // use_ai rides the payload only when the submitter has been given
        // the choice; in every other render state we leave the server-side
        // default alone.
        ...(showAiToggle.value ? { use_ai: useAi.value } : {}),
      };

      // Push the user's draft into the conversation immediately and clear
      // the composer BEFORE awaiting submit(). The visual progression is
      // what makes the wait feel fast — a synchronous bubble + cleared
      // input lets the staged-status rows below carry the rest of the
      // animation while the network round-trip is in flight (#74).
      const submittedDraft = draft.value;
      const filesSnapshot: readonly MessageAttachment[] | undefined =
        files.value.length > 0
          ? files.value.map(({ file }) => ({ blob: file, filename: file.name }))
          : undefined;
      const userMessage: Message = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        text: submittedDraft,
        attachments: filesSnapshot ? { files: filesSnapshot } : undefined,
      };
      messages.value = [...messages.value, userMessage];
      draft.value = '';
      expected.value = '';
      actual.value = '';
      showExtras.value = false;
      files.value = [];
      lastSubmittedInput = input;
      lastUserMessageId = userMessage.id;

      try {
        const result = await submit(input);
        if (!mounted) return;
        props.onSubmit?.(result);
        attachRawPayload(userMessage.id, result);
        if (result.ok) {
          messages.value = [
            ...messages.value,
            {
              id: `msg-${++messageIdCounter}`,
              role: 'assistant',
              text: ASSISTANT_RECEIPT_TEXT,
              issueSent: true,
              sentAt: Date.now(),
            },
          ];
          // If the user minimized mid-submit, pop the panel back open so
          // the success confirmation is actually seen.
          open.value = true;
        } else {
          // Failure: the user bubble is already in the thread; the staged
          // rows collapse into a red retry row driven by `phase === 'error'`.
          open.value = true;
        }
      } catch {
        if (!mounted) return;
        // Chunk-load failure path — the composable has already flipped
        // phase to `'error'` and stored a synthetic SubmitError. Just pop
        // the panel back open so the retry row is visible.
        open.value = true;
      }
    }

    /**
     * Re-run the most recent submit with the original `FeedbackInput`. The
     * user bubble is already in the thread (pushed on the first Send), so
     * the retry path only re-fires `submit()` and appends the assistant
     * receipt on success — no duplicate bubble for the retry.
     */
    async function doRetry(): Promise<void> {
      if (!lastSubmittedInput) return;
      if (status.value === 'submitting') return;
      try {
        const result = await submit(lastSubmittedInput);
        if (!mounted) return;
        props.onSubmit?.(result);
        if (lastUserMessageId) attachRawPayload(lastUserMessageId, result);
        if (result.ok) {
          messages.value = [
            ...messages.value,
            {
              id: `msg-${++messageIdCounter}`,
              role: 'assistant',
              text: ASSISTANT_RECEIPT_TEXT,
              issueSent: true,
              sentAt: Date.now(),
            },
          ];
        }
        open.value = true;
      } catch {
        if (!mounted) return;
        open.value = true;
      }
    }

    function onComposerKeyDown(e: KeyboardEvent): void {
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        // happy-dom does not stamp `isComposing` on its KeyboardEvent, so
        // guard with a typeof check before dereferencing.
        !(e as KeyboardEvent & { isComposing?: boolean }).isComposing
      ) {
        e.preventDefault();
        void doSubmit();
      }
    }

    return () => {
      if (props.hidden) return null;
      return h('div', { class: 'brw-host' }, [
        renderFab(),
        open.value ? renderPanel() : null,
      ]);
    };

    function renderFab(): VNode {
      return h(
        'button',
        {
          type: 'button',
          'data-brevwick-skip': '',
          'data-brw-theme': props.theme,
          class: [rootClassName.value, 'brw-fab', fabPosClass.value],
          disabled: props.disabled,
          'aria-label': 'Open feedback form',
          onClick: handleOpen,
        },
        [renderChatIcon(), props.label],
      );
    }

    function renderPanel(): VNode {
      const submitting = status.value === 'submitting';
      return h(
        'div',
        {
          'data-brevwick-skip': '',
          'data-brw-theme': props.theme,
          class: [rootClassName.value, 'brw-panel', panelPosClass.value],
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Send feedback',
        },
        [
          renderHeader(submitting),
          renderThread(),
          renderComposer(submitting),
          renderFooter(),
        ],
      );
    }

    function renderHeader(submitting: boolean): VNode {
      return h('div', { class: 'brw-panel-header' }, [
        h('span', { class: 'brw-panel-avatar', 'aria-hidden': 'true' }, 'B'),
        h('h2', { class: 'brw-panel-title' }, 'Send feedback'),
        h(
          'button',
          {
            type: 'button',
            class: 'brw-icon-btn',
            'aria-label': 'Minimize',
            onClick: handleMinimize,
          },
          [renderMinimizeIcon()],
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'brw-icon-btn',
            'aria-label': 'Close',
            disabled: submitting,
            onClick: handleCloseClick,
          },
          [renderCloseIcon()],
        ),
      ]);
    }

    function renderThread(): VNode {
      const phaseRank = PHASE_RANK[phase.value];
      const showCaptured = phaseRank >= PHASE_RANK.sanitising;
      const showSanitised = phaseRank >= PHASE_RANK.formatting;
      const showFormatting = phase.value === 'formatting' && aiEnabled.value;
      const showRetryRow =
        phase.value === 'error' && submitErrorTagged.value !== null;

      const children: Array<VNode | null> = [];

      for (const message of messages.value) {
        if (message.role === 'assistant') {
          children.push(renderAssistantBubble(message));
        } else {
          const bubbleChildren: Array<VNode | string> = [message.text];
          if (message.rawPayload !== undefined) {
            const copiedMsg = message;
            bubbleChildren.push(
              h(
                'button',
                {
                  type: 'button',
                  class: 'brw-copy-raw',
                  'aria-label': 'Copy the raw payload sent to the API',
                  'data-brw-copy-raw': '',
                  onClick: () => copyRaw(copiedMsg),
                },
                copiedRawId.value === message.id
                  ? 'Copied!'
                  : 'Copy raw payload',
              ),
            );
          }
          children.push(
            h(
              'div',
              { key: message.id, class: 'brw-bubble brw-bubble--user' },
              bubbleChildren,
            ),
          );
        }
      }

      for (const { id, file } of files.value) {
        children.push(
          renderAttachmentChip(file.name, file.size, () => removeFile(id), id),
        );
      }

      children.push(renderDisclosure());

      if (submitError.value) {
        children.push(
          h('div', { class: 'brw-error', role: 'alert' }, submitError.value),
        );
      }

      if (showCaptured || showSanitised || showFormatting) {
        const rows: Array<VNode> = [];
        if (showCaptured) {
          rows.push(
            renderStatusRow(
              'check',
              // Row 1 anchors the cascade at 0 ms; rows 2 + 3 stagger off it.
              0,
              'captured',
              'Captured route, console, network, device',
            ),
          );
        }
        if (showSanitised) {
          rows.push(
            renderStatusRow(
              'check',
              reducedMotion.value ? 0 : STATUS_ROW_STAGGER_MS,
              'sanitised',
              'PII-sanitised, packaged',
            ),
          );
        }
        if (showFormatting) {
          rows.push(
            renderStatusRow(
              'spinner',
              reducedMotion.value ? 0 : STATUS_ROW_STAGGER_MS * 2,
              'formatting',
              'Formatting with AI…',
            ),
          );
        }
        children.push(h('div', { class: 'brw-status-rows' }, rows));
      }
      if (showRetryRow && submitErrorTagged.value) {
        children.push(renderRetryRow(submitErrorTagged.value));
      }
      if (confirmClose.value) {
        children.push(renderDiscardConfirm());
      }

      return h(
        'div',
        {
          class: 'brw-thread',
          role: 'log',
          'aria-live': 'polite',
          'aria-label': 'Conversation',
        },
        children,
      );
    }

    function renderAssistantBubble(message: Message): VNode {
      const receipt = message.issueSent
        ? h('div', { class: 'brw-bubble--receipt' }, [
            renderCheckIcon(),
            ' Issue sent · ',
            formatRelativeTime(message.sentAt),
          ])
        : null;
      return h(
        'div',
        { key: message.id, class: 'brw-bubble brw-bubble--assistant' },
        [message.text, receipt],
      );
    }

    function renderAttachmentChip(
      name: string,
      size: number,
      onRemove: () => void,
      key: string | number,
    ): VNode {
      return h('div', { key, class: 'brw-chip' }, [
        h('span', { class: 'brw-chip-name' }, name),
        h('span', { class: 'brw-chip-size' }, formatSize(size)),
        h(
          'button',
          {
            type: 'button',
            class: 'brw-chip-remove',
            'aria-label': `Remove ${name}`,
            onClick: onRemove,
          },
          '×',
        ),
      ]);
    }

    function renderDisclosure(): VNode {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'brw-disclosure',
          'aria-expanded': String(showExtras.value),
          'aria-controls': disclosurePanelId,
          onClick: () => {
            showExtras.value = !showExtras.value;
          },
        },
        showExtras.value ? 'Hide expected vs actual' : 'Add expected vs actual',
      );
      if (!showExtras.value) return button;
      const panel = h(
        'div',
        { id: disclosurePanelId, class: 'brw-disclosure-panel' },
        [
          h('label', null, [
            h('span', { class: 'brw-disclosure-label' }, 'Expected'),
            h('textarea', {
              class: 'brw-disclosure-input',
              rows: 2,
              'aria-label': 'Expected',
              value: expected.value,
              onInput: (e: Event) => {
                expected.value = (e.target as HTMLTextAreaElement).value;
              },
            }),
          ]),
          h('label', null, [
            h('span', { class: 'brw-disclosure-label' }, 'Actual'),
            h('textarea', {
              class: 'brw-disclosure-input',
              rows: 2,
              'aria-label': 'Actual',
              value: actual.value,
              onInput: (e: Event) => {
                actual.value = (e.target as HTMLTextAreaElement).value;
              },
            }),
          ]),
        ],
      );
      // Render the disclosure button followed by the panel as siblings so
      // `aria-controls` resolves and the panel keeps a stable position in
      // the thread layout.
      return h('span', { class: 'brw-disclosure-wrap' }, [button, panel]);
    }

    function renderStatusRow(
      variant: 'check' | 'spinner',
      delayMs: number,
      dataRow: string,
      label: string,
    ): VNode {
      const indicator =
        variant === 'check'
          ? h(
              'span',
              { class: 'brw-status-row-check', 'aria-hidden': 'true' },
              [renderCheckIcon()],
            )
          : h('span', { class: 'brw-spinner', 'aria-hidden': 'true' });
      return h(
        'div',
        {
          key: dataRow,
          class: 'brw-status-row',
          style: { animationDelay: `${delayMs}ms` },
          'data-brw-row': dataRow,
        },
        [indicator, h('span', { class: 'brw-status-row-label' }, label)],
      );
    }

    function renderRetryRow(err: SubmitError): VNode {
      return h(
        'div',
        {
          key: 'retry-row',
          class: 'brw-status-row brw-status-row--error',
          role: 'alert',
          'data-brw-error-code': err.code,
          'data-brw-row': 'error',
        },
        [
          err.message,
          h(
            'button',
            {
              type: 'button',
              class: 'brw-btn brw-status-row-retry',
              onClick: () => {
                void doRetry();
              },
            },
            'Retry',
          ),
        ],
      );
    }

    function renderDiscardConfirm(): VNode {
      return h(
        'div',
        {
          class: 'brw-confirm',
          role: 'alert',
          'aria-label': 'Discard draft?',
        },
        [
          h('span', { class: 'brw-confirm-msg' }, 'Discard your feedback?'),
          h(
            'button',
            {
              ref: keepBtnRef,
              type: 'button',
              class: 'brw-btn',
              onClick: () => {
                confirmClose.value = false;
              },
            },
            'Keep',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'brw-btn brw-btn-primary',
              onClick: handleFullClose,
            },
            'Discard',
          ),
        ],
      );
    }

    function renderComposer(submitting: boolean): VNode {
      const attachDisabled = submitting || attachmentsAtCap.value;
      const fileLabel = attachmentsAtCap.value
        ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
        : 'Attach file';
      const sendDisabled = submitting || draft.value.trim().length === 0;

      const composerChildren: Array<VNode | null> = [
        h('label', { class: 'brw-icon-btn' }, [
          renderPaperclipIcon(),
          h('input', {
            type: 'file',
            multiple: true,
            'aria-label': fileLabel,
            class: 'brw-file-input',
            onChange: (e: Event) => {
              const target = e.target as HTMLInputElement;
              handleFiles(target.files);
              target.value = '';
            },
            disabled: attachDisabled,
          }),
        ]),
        h('textarea', {
          ref: composerRef,
          class: 'brw-composer-input',
          rows: 1,
          placeholder: 'Describe the bug or feedback…',
          'aria-label': 'Feedback message',
          value: draft.value,
          onInput: (e: Event) => {
            draft.value = (e.target as HTMLTextAreaElement).value;
          },
          onKeydown: onComposerKeyDown,
        }),
        showAiToggle.value ? renderAIToggle(submitting) : null,
        h(
          'button',
          {
            type: 'button',
            class: 'brw-send-btn',
            'aria-label': 'Send',
            disabled: sendDisabled,
            onClick: () => {
              void doSubmit();
            },
          },
          [renderSendIcon()],
        ),
      ];

      return h('div', { class: 'brw-composer' }, [
        h('div', { class: 'brw-composer-shell' }, composerChildren),
      ]);
    }

    function renderAIToggle(submitting: boolean): VNode {
      const on = useAi.value;
      return h('span', { class: 'brw-aitoggle-wrap' }, [
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': String(on),
            'aria-label': 'Format with AI',
            class: ['brw-aitoggle', on ? 'brw-aitoggle--on' : ''].join(' '),
            disabled: submitting,
            onClick: () => {
              useAi.value = !useAi.value;
            },
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === ' ') {
                e.preventDefault();
                useAi.value = !useAi.value;
              }
            },
          },
          [
            h('span', {
              class: 'brw-aitoggle-thumb',
              'aria-hidden': 'true',
            }),
          ],
        ),
        h('span', { class: 'brw-aitoggle-text', 'aria-hidden': 'true' }, 'AI'),
      ]);
    }

    function renderFooter(): VNode {
      return h('div', { class: 'brw-panel-footer' }, [
        h(
          'a',
          {
            class: 'brw-panel-footer-link',
            href: 'https://brevwick.dev',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          `Brevwick v${BREVWICK_VUE_VERSION}`,
        ),
      ]);
    }
  },
});

function renderChatIcon(): VNode {
  return h(
    'svg',
    {
      class: 'brw-fab-icon',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [h('path', { d: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z' })],
  );
}

function renderMinimizeIcon(): VNode {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [h('path', { d: 'M5 14h14' })],
  );
}

function renderCloseIcon(): VNode {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [h('path', { d: 'M6 6l12 12M18 6L6 18' })],
  );
}

function renderPaperclipIcon(): VNode {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [
      h('path', {
        d: 'M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5',
      }),
    ],
  );
}

function renderSendIcon(): VNode {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [h('path', { d: 'M4 20l16-8L4 4l2 8-2 8z' }), h('path', { d: 'M6 12h14' })],
  );
}

function renderCheckIcon(): VNode {
  return h(
    'svg',
    {
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [h('path', { d: 'M5 12l5 5L20 7' })],
  );
}
