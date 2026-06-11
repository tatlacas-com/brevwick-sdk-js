import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
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
 * only the underlying `Blob` (not the live `ScreenshotAttachment.url`),
 * mirroring the React adapter's `MessageAttachment` — the success path
 * revokes the composer's object URL the moment the snapshot is appended, so
 * keeping the URL on the message would leave a dangling reference. A future
 * render that wants to preview the attachment can call
 * `URL.createObjectURL(blob)` itself.
 */
interface MessageAttachment {
  readonly blob: Blob;
  readonly filename?: string;
}

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
 * `attachments` snapshots the screenshots + files that rode along with the
 * submit so a follow-up render can show what was sent (currently the bubble
 * itself just shows text, but the field is there for forward-compat).
 */
interface Message {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sentAt?: number;
  issueSent?: boolean;
  attachments?: {
    screenshots?: readonly MessageAttachment[];
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
 * Combined screenshot + file cap, mirrored from the SDK's
 * `MAX_ATTACHMENT_COUNT` in `packages/sdk/src/submit.ts`. Enforced in the
 * UI by disabling the screenshot and file-attach buttons once the combined
 * total reaches this ceiling — that way the user can't queue an attachment
 * the SDK would reject downstream.
 */
const MAX_ATTACHMENTS = 5;

interface ScreenshotAttachment {
  /**
   * Monotonic id assigned at capture time. Same rationale as
   * {@link FileAttachment.id}: keys based on `url` or array index would
   * reconcile a removal-of-middle-item against the wrong slot.
   */
  readonly id: number;
  readonly blob: Blob;
  readonly url: string;
}

/** Viewport-space rectangle selected by the user on the region overlay. */
interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Minimum accepted side length (px) — below this the selection is treated
 *  as an accidental click and the confirm is rejected with a shake. */
const REGION_MIN_SIDE_PX = 2;

/** Live drag rectangle on the region overlay, anchored at the pointer-down
 *  point so the selection normalises regardless of drag direction. */
interface DragState {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

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
 * by the SDK's phase bus, retry row on failure, screenshot capture with a
 * region-select overlay, thumbnail chips with a tap-to-preview dialog).
 * See SDD § 12.
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
    const {
      submit,
      captureScreenshot,
      status,
      phase,
      error: submitErrorTagged,
    } = useFeedback();
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
    // `shallowRef` (every mutation reassigns the whole array) so the
    // captured `Blob`s are never wrapped in deep-reactive proxies — the
    // exact blob instance must ride the wire into `submit()` untouched.
    const screenshots = shallowRef<ScreenshotAttachment[]>([]);
    const files = ref<FileAttachment[]>([]);
    // True while a screenshot is being rasterised / cropped (issue #55).
    // Drives the in-thread "Capturing screenshot…" bubble and disables the
    // screenshot / file / send controls so a second capture or a submit
    // can't race the one in flight.
    const capturing = ref(false);
    // True while the region-select overlay is up. The panel stays mounted
    // (state preserved) but gets `brw-panel-hidden` so the user can see —
    // and select a region over — page content the panel would otherwise
    // cover (issue #49).
    const regionOpen = ref(false);
    // Stable screenshot id of the thumbnail the user tapped to preview;
    // `null` keeps the preview dialog closed. Using the id (not the array
    // index) means the dialog stays bound to the same attachment if the
    // user removes a sibling screenshot mid-preview — `removeScreenshot()`
    // clears `previewId` only when the previewed screenshot itself goes.
    const previewId = ref<number | null>(null);
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
    let screenshotIdCounter = 0;
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
    // Region-overlay drag selection. `dragging` is a plain flag (not a ref)
    // because nothing renders off it — it only gates the move/up handlers.
    const drag = ref<DragState | null>(null);
    const shake = ref(false);
    let dragging = false;
    // Tracks the in-flight "shake settle" setTimeout. We keep the handle so
    // (a) closing the overlay cancels it — otherwise a shake queued right
    // before Esc would mutate state behind a torn-down overlay — and (b)
    // rapid-fire Capture clicks on a degenerate selection replace the timer
    // instead of stacking.
    let shakeTimer: ReturnType<typeof setTimeout> | undefined;
    const overlayRef = ref<HTMLDivElement | null>(null);
    const previewLayerRef = ref<HTMLDivElement | null>(null);
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
      if (shakeTimer) clearTimeout(shakeTimer);
      // Revoke any live screenshot object URLs so an unmount mid-composition
      // doesn't leak blob references for the lifetime of the document.
      for (const s of screenshots.value) URL.revokeObjectURL(s.url);
      screenshots.value = [];
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

    const attachmentCount = computed(
      () => screenshots.value.length + files.value.length,
    );
    const attachmentsAtCap = computed(
      () => attachmentCount.value >= MAX_ATTACHMENTS,
    );

    const hasContent = computed(
      () =>
        draft.value.trim().length > 0 ||
        expected.value.length > 0 ||
        actual.value.length > 0 ||
        screenshots.value.length > 0 ||
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
      for (const s of screenshots.value) URL.revokeObjectURL(s.url);
      screenshots.value = [];
      files.value = [];
      previewId.value = null;
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
      // Cap the combined screenshot+file total at MAX_ATTACHMENTS so a
      // bulk-add via <input multiple> can't exceed the SDK ceiling. Keep
      // prefix-of-input semantics: drop the overflow tail rather than
      // silently dropping arbitrary entries.
      const remaining =
        MAX_ATTACHMENTS - (files.value.length + screenshots.value.length);
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

    // Split from the historical one-shot capture: the button only opens the
    // region overlay, and the overlay fans out to either a full-page or a
    // cropped capture. Closing the overlay and starting `captureScreenshot()`
    // happen in the same tick — the primary protection against the overlay
    // bleeding into the rendered page is `data-brevwick-skip` on every
    // overlay node, which the SDK's capture path honours before it
    // snapshots; the unmount landing first is defence-in-depth.
    //
    // `capturing` is the in-thread loading flag (issue #55). The region
    // overlay closes the moment the user clicks Capture so the panel is
    // already visible by the time `captureScreenshot()` resolves; the flag
    // surfaces a "Capturing screenshot…" bubble in the thread to bridge
    // that gap so the panel re-appearing without the chip isn't mysterious.
    async function performCapture(region: Region | null): Promise<void> {
      submitError.value = null;
      capturing.value = true;
      try {
        const blob = await captureScreenshot();
        if (!mounted) return;
        const finalBlob = region ? await cropToRegion(blob, region) : blob;
        if (!mounted) return;
        // Defence-in-depth: the screenshot button is disabled at the cap,
        // but a long-running capture started before files were attached can
        // still land after the combined total is at the ceiling — refs are
        // live, so this re-check sees anything attached while the capture
        // was in flight. Drop the new capture rather than silently exceed
        // the SDK's combined attachment ceiling. (The object URL is only
        // created for a kept capture so a rejected one doesn't leak.)
        if (screenshots.value.length + files.value.length >= MAX_ATTACHMENTS) {
          submitError.value = `Maximum ${MAX_ATTACHMENTS} attachments reached`;
          return;
        }
        screenshots.value = [
          ...screenshots.value,
          {
            id: ++screenshotIdCounter,
            blob: finalBlob,
            url: URL.createObjectURL(finalBlob),
          },
        ];
      } catch (err) {
        if (!mounted) return;
        // Non-blocking failure: inline role=alert, no chip, Send re-enabled
        // immediately (via the finally below) — capture failure must never
        // block submission.
        submitError.value =
          err instanceof Error ? err.message : 'Screenshot capture failed';
      } finally {
        if (mounted) capturing.value = false;
      }
    }

    function clearShakeTimer(): void {
      if (shakeTimer) {
        clearTimeout(shakeTimer);
        shakeTimer = undefined;
      }
    }

    /** Reset the overlay's drag + shake scratch state so a re-open starts
     *  from a clean slate rather than the last session's selection. */
    function resetRegionScratch(): void {
      drag.value = null;
      shake.value = false;
      dragging = false;
      clearShakeTimer();
    }

    function handleOpenRegionOverlay(): void {
      submitError.value = null;
      resetRegionScratch();
      regionOpen.value = true;
      // Focus the overlay root once it mounts so Esc-to-dismiss and the
      // Enter-to-confirm shortcut work without a pointer round-trip.
      void nextTick(() => {
        overlayRef.value?.focus();
      });
    }

    function handleCloseRegion(): void {
      regionOpen.value = false;
      resetRegionScratch();
    }

    function handleConfirmRegion(region: Region): void {
      regionOpen.value = false;
      resetRegionScratch();
      void performCapture(region);
    }

    function handleConfirmFull(): void {
      regionOpen.value = false;
      resetRegionScratch();
      void performCapture(null);
    }

    function removeScreenshot(id: number): void {
      const target = screenshots.value.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      screenshots.value = screenshots.value.filter((s) => s.id !== id);
      if (previewId.value === id) previewId.value = null;
    }

    function handlePreviewScreenshot(id: number): void {
      previewId.value = id;
      void nextTick(() => {
        previewLayerRef.value?.focus();
      });
    }

    function handleClosePreview(): void {
      previewId.value = null;
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
     * POSTed to the ingest endpoint) to the clipboard. Pretty-printed with a
     * two-space indent; the parsed JSON matches what was sent over the wire
     * (only the whitespace differs from the unindented request body). Degrades
     * to a no-op where the async clipboard API is missing.
     */
    function copyRaw(message: Message): void {
      if (!message.rawPayload) return;
      const json = JSON.stringify(message.rawPayload, null, 2);
      const clip = navigator.clipboard;
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
      // Block submission while a capture is in flight. Without this, the
      // user could press Enter in the composer between clicking Capture and
      // the thumbnail rendering, sending the issue without the screenshot
      // they intended to include. The Send button itself is disabled in
      // this state, but the Enter-to-send shortcut bypasses the button so
      // the guard belongs here on the submit path too.
      if (capturing.value) return;
      if (!draft.value.trim()) {
        submitError.value = 'Please describe what happened.';
        return;
      }
      submitError.value = null;

      const attachments: Array<Blob | FeedbackAttachment> = [];
      // Single-screenshot filename stays `screenshot.<ext>` (matches the
      // pre-#56 wire format and keeps existing tests / server-side
      // identifiers stable). Multi-screenshot submissions disambiguate with
      // `-1`, `-2`, … using the array order they were captured in.
      screenshots.value.forEach((s, idx) => {
        const ext = s.blob.type.split('/')[1]?.split('+')[0] || 'webp';
        const filename =
          screenshots.value.length === 1
            ? `screenshot.${ext}`
            : `screenshot-${idx + 1}.${ext}`;
        attachments.push({ blob: s.blob, filename });
      });
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
      const screenshotsSnapshot: readonly MessageAttachment[] | undefined =
        screenshots.value.length > 0
          ? screenshots.value.map((s) => ({ blob: s.blob }))
          : undefined;
      const filesSnapshot: readonly MessageAttachment[] | undefined =
        files.value.length > 0
          ? files.value.map(({ file }) => ({ blob: file, filename: file.name }))
          : undefined;
      const userMessage: Message = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        text: submittedDraft,
        attachments:
          screenshotsSnapshot || filesSnapshot
            ? {
                ...(screenshotsSnapshot
                  ? { screenshots: screenshotsSnapshot }
                  : {}),
                ...(filesSnapshot ? { files: filesSnapshot } : {}),
              }
            : undefined,
      };
      messages.value = [...messages.value, userMessage];
      draft.value = '';
      expected.value = '';
      actual.value = '';
      showExtras.value = false;
      // The user bubble keeps the screenshot *blobs* in its attachments
      // snapshot, so the live composer object URLs can be dropped here —
      // keeping a URL on the message would leave a dangling reference once
      // revoked.
      for (const s of screenshots.value) URL.revokeObjectURL(s.url);
      screenshots.value = [];
      files.value = [];
      previewId.value = null;
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
        regionOpen.value ? renderRegionOverlay() : null,
        renderPreviewDialog(),
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
          // Hide the panel while the region overlay is up so the user can
          // see (and select a region over) page content the panel would
          // otherwise cover. The panel stays mounted — visibility:hidden
          // preserves composer state, and the existing `data-brevwick-skip`
          // keeps it out of the captured image (issue #49).
          class: [
            rootClassName.value,
            'brw-panel',
            panelPosClass.value,
            regionOpen.value ? 'brw-panel-hidden' : '',
          ],
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

      screenshots.value.forEach((s, idx) => {
        const label =
          screenshots.value.length === 1
            ? 'screenshot'
            : `screenshot ${idx + 1}`;
        children.push(
          renderAttachmentChip(
            label,
            s.blob.size,
            () => removeScreenshot(s.id),
            `shot-${s.id}`,
            {
              previewUrl: s.url,
              onPreview: () => handlePreviewScreenshot(s.id),
            },
          ),
        );
      });

      for (const { id, file } of files.value) {
        children.push(
          renderAttachmentChip(file.name, file.size, () => removeFile(id), id),
        );
      }

      // In-thread loading indicator (issue #55). The region overlay closes
      // before `captureScreenshot()` resolves, so the panel is already
      // visible when this bubble shows up — it bridges the otherwise-silent
      // gap between the overlay closing and the thumbnail appearing.
      if (capturing.value) {
        children.push(
          h(
            'div',
            { key: 'capturing', class: 'brw-bubble brw-bubble--assistant' },
            [
              h('span', { class: 'brw-spinner', 'aria-hidden': 'true' }),
              ' Capturing screenshot…',
            ],
          ),
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
      preview?: { previewUrl: string; onPreview: () => void },
    ): VNode {
      // Screenshot chips render the thumbnail as a button so keyboard
      // activation comes free with <button> — screen-reader users can hit
      // Enter / Space to open the preview the same way pointer users click.
      // The remove × is a sibling, so clicks on it don't propagate into the
      // thumbnail's open-preview path. File chips (no preview) stay
      // text-only — they are not previewable.
      return h('div', { key, class: 'brw-chip' }, [
        preview
          ? h(
              'button',
              {
                type: 'button',
                class: 'brw-chip-preview-btn',
                'aria-label': `Preview ${name}`,
                onClick: preview.onPreview,
              },
              [h('img', { src: preview.previewUrl, alt: '' })],
            )
          : null,
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
      // Once a capture is in flight or the attachment cap is reached, the
      // screenshot + file-attach controls are disabled. The aria-label on
      // the screenshot button mutates so AT users hear *why* the control is
      // unavailable instead of the generic "Capture screenshot of this
      // page, dimmed" announcement.
      const attachDisabled =
        submitting || capturing.value || attachmentsAtCap.value;
      const screenshotLabel = attachmentsAtCap.value
        ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
        : capturing.value
          ? 'Capturing screenshot…'
          : 'Capture screenshot of this page';
      const fileLabel = attachmentsAtCap.value
        ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
        : 'Attach file';
      const sendDisabled =
        submitting || capturing.value || draft.value.trim().length === 0;

      const composerChildren: Array<VNode | null> = [
        h(
          'button',
          {
            type: 'button',
            class: 'brw-icon-btn',
            'aria-label': screenshotLabel,
            disabled: attachDisabled,
            onClick: handleOpenRegionOverlay,
          },
          [renderScreenshotIcon()],
        ),
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

    function onOverlayPointerDown(e: PointerEvent): void {
      // Pointerdown bubbles from the Cancel / Capture / Capture-full-page
      // controls up through this handler. Without this guard the bubbled
      // event would reinitialise the drag state to a zero-size rect right
      // before the button's own click fires, sending a valid selection into
      // the degenerate-shake path. `currentTarget` is always the overlay
      // layer; only initiate a drag when the press landed directly on it.
      if (e.target !== e.currentTarget) return;
      // Ignore non-primary buttons (right-click / middle-click). pointerType
      // 'touch' and 'pen' always issue button === 0.
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragging = true;
      drag.value = {
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        w: 0,
        h: 0,
      };
    }

    function onOverlayPointerMove(e: PointerEvent): void {
      if (!dragging) return;
      const prev = drag.value;
      if (!prev) return;
      drag.value = {
        startX: prev.startX,
        startY: prev.startY,
        x: Math.min(prev.startX, e.clientX),
        y: Math.min(prev.startY, e.clientY),
        w: Math.abs(e.clientX - prev.startX),
        h: Math.abs(e.clientY - prev.startY),
      };
    }

    function onOverlayPointerUp(e: PointerEvent): void {
      if (!dragging) return;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      dragging = false;
    }

    function confirmRegionSelection(): void {
      const current = drag.value;
      if (
        !current ||
        current.w <= REGION_MIN_SIDE_PX ||
        current.h <= REGION_MIN_SIDE_PX
      ) {
        shake.value = true;
        // Replace any in-flight settle timer so rapid-fire clicks don't
        // stack.
        clearShakeTimer();
        shakeTimer = setTimeout(() => {
          shakeTimer = undefined;
          shake.value = false;
        }, 320);
        return;
      }
      handleConfirmRegion({
        x: current.x,
        y: current.y,
        w: current.w,
        h: current.h,
      });
    }

    function onOverlayKeyDown(e: KeyboardEvent): void {
      // Esc-to-dismiss is owned here (no Radix in the Vue adapter); it
      // must not bubble into the page's own Escape handling.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCloseRegion();
        return;
      }
      // Enter must only confirm the region when the overlay root itself has
      // focus. Tab-focusing a button inside the overlay and pressing Enter
      // bubbles up here; without this guard we would hijack the button's
      // own Enter activation (Cancel, Capture full page) and run the
      // region-confirm path instead — a real a11y defect.
      if (e.key !== 'Enter') return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      confirmRegionSelection();
    }

    /**
     * Full-viewport overlay that lets the submitter drag-select a rectangle
     * on top of the page. Confirming with a non-degenerate rectangle fans
     * out to the crop pipeline; 'Capture full page' preserves the pre-#31
     * behaviour for users who want the whole viewport.
     *
     * Every node rendered here carries `data-brevwick-skip=""` so a rogue
     * capture that fires while the overlay is still in the tree excludes
     * the overlay chrome from the image (the capture path unmounts the
     * overlay first — this is defence-in-depth).
     */
    function renderRegionOverlay(): VNode {
      const current = drag.value;
      return h('div', { 'data-brevwick-skip': '' }, [
        h('div', { class: 'brw-region-backdrop', 'data-brevwick-skip': '' }),
        h(
          'div',
          {
            ref: overlayRef,
            class: [
              'brw-root',
              'brw-region-layer',
              shake.value ? 'brw-region-shake' : '',
            ],
            'data-brevwick-skip': '',
            'data-brw-theme': props.theme,
            'data-testid': 'brw-region-overlay',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Select screenshot region',
            tabindex: -1,
            onPointerdown: onOverlayPointerDown,
            onPointermove: onOverlayPointerMove,
            onPointerup: onOverlayPointerUp,
            onPointercancel: onOverlayPointerUp,
            onKeydown: onOverlayKeyDown,
          },
          [
            h('h2', { class: 'brw-sr-only' }, 'Select screenshot region'),
            current && current.w > 0 && current.h > 0
              ? h('div', {
                  class: 'brw-region-selection',
                  'data-testid': 'brw-region-selection',
                  style: {
                    left: `${current.x}px`,
                    top: `${current.y}px`,
                    width: `${current.w}px`,
                    height: `${current.h}px`,
                  },
                })
              : null,
            h(
              'div',
              { class: 'brw-region-controls', 'data-brevwick-skip': '' },
              [
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'brw-btn brw-region-btn',
                    onClick: handleCloseRegion,
                  },
                  'Cancel',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'brw-btn brw-region-btn',
                    onClick: handleConfirmFull,
                  },
                  'Capture full page',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'brw-btn brw-btn-primary brw-region-btn',
                    onClick: confirmRegionSelection,
                  },
                  'Capture',
                ),
              ],
            ),
          ],
        ),
      ]);
    }

    /**
     * Modal dialog that shows the captured screenshot at viewport-fit size
     * so the submitter can confirm they captured the right region before
     * sending. Carries `data-brevwick-skip=""` on every node so a
     * re-capture initiated while the dialog is up doesn't snapshot the
     * dialog chrome itself.
     */
    function renderPreviewDialog(): VNode | null {
      if (previewId.value === null) return null;
      const screenshot =
        screenshots.value.find((s) => s.id === previewId.value) ?? null;
      if (!screenshot) return null;
      return h('div', { 'data-brevwick-skip': '' }, [
        h('div', { class: 'brw-preview-backdrop', 'data-brevwick-skip': '' }),
        h(
          'div',
          {
            ref: previewLayerRef,
            class: 'brw-root brw-preview-layer',
            'data-brevwick-skip': '',
            'data-brw-theme': props.theme,
            'data-testid': 'brw-preview-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Screenshot preview',
            tabindex: -1,
            onKeydown: (e: KeyboardEvent) => {
              // Esc closes only the preview — it must not bubble into the
              // panel's own minimize handling.
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleClosePreview();
              }
            },
          },
          [
            h('h2', { class: 'brw-sr-only' }, 'Screenshot preview'),
            h('img', {
              class: 'brw-preview-image',
              src: screenshot.url,
              alt: 'Captured screenshot',
            }),
            h(
              'button',
              {
                type: 'button',
                class: 'brw-icon-btn brw-preview-close',
                'aria-label': 'Close preview',
                onClick: handleClosePreview,
              },
              [renderCloseIcon()],
            ),
          ],
        ),
      ]);
    }
  },
});

/**
 * Crop a full-page screenshot Blob to the user-selected viewport rectangle.
 *
 * The source Blob from `captureScreenshot()` is rendered in device pixels by
 * `modern-screenshot`, but the region came from pointer-events in CSS pixels,
 * so we multiply the source rectangle by `devicePixelRatio` on the way in and
 * draw out at the selection's CSS-pixel size. Uses `OffscreenCanvas` when the
 * host provides it *with* a working `convertToBlob` (cheaper, avoids a DOM
 * node); otherwise falls back to a detached `<canvas>` + `toBlob`. Some
 * environments expose `OffscreenCanvas` without `convertToBlob`, so presence
 * alone is not enough — we feature-detect the method before taking that path.
 * Output MIME is PNG — the caller derives the attachment filename from
 * `blob.type`.
 */
async function cropToRegion(blob: Blob, region: Region): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageForCrop(url);
    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const sx = region.x * dpr;
    const sy = region.y * dpr;
    const sw = region.w * dpr;
    const sh = region.h * dpr;

    const OffscreenCanvasCtor =
      typeof OffscreenCanvas !== 'undefined' &&
      'convertToBlob' in OffscreenCanvas.prototype
        ? OffscreenCanvas
        : undefined;
    if (OffscreenCanvasCtor) {
      const canvas = new OffscreenCanvasCtor(region.w, region.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, region.w, region.h);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, region.w, region.h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) =>
          out ? resolve(out) : reject(new Error('Canvas produced no blob')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageForCrop(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Screenshot failed to load for crop'));
    img.src = src;
  });
}

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

function renderScreenshotIcon(): VNode {
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
      h('rect', { x: '3', y: '5', width: '18', height: '12', rx: '2' }),
      h('rect', {
        x: '7',
        y: '8',
        width: '10',
        height: '6',
        rx: '1',
        'stroke-dasharray': '2 2',
      }),
    ],
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
