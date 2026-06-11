<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import type {
    FeedbackAttachment,
    FeedbackInput,
    ProjectConfig,
    SubmitResult,
  } from '@tatlacas/brevwick-sdk';
  import { getFeedback } from '../context';
  import { BREVWICK_SVELTE_VERSION } from '../internal/version';
  import {
    resolveLauncherPlacement,
    type FeedbackButtonPosition,
    type FeedbackButtonVariant,
  } from '../launcher';

  // Props use `export let` (not `$props()` runes) so the SFC compiles
  // under both legacy and runes-mode hosts. Revisit at Svelte 6.
  /**
   * Launcher presentation. Default `'tab'` (new default). Intentionally no
   * prop-level default — `resolveLauncherPlacement` must see "unset" so the
   * corner-implies-bubble compat rule can fire.
   */
  export let variant: FeedbackButtonVariant | undefined = undefined;
  /**
   * Launcher placement. Defaults: `'right'` (tab), `'bottom-right'`
   * (bubble). A legacy corner without an explicit `variant` keeps the
   * bubble; when both are set, `variant` wins and `position` contributes
   * only its horizontal side.
   */
  export let position: FeedbackButtonPosition | undefined = undefined;
  /**
   * Icon-only mode (circular bubble / square edge tab). The `label` is not
   * rendered but becomes the `aria-label`. Default `false`.
   */
  export let compact: boolean = false;
  /**
   * Tab-only: vertical offset in px from the viewport's vertical center
   * (positive = down). Ignored for the bubble. Default `0`.
   */
  export let offset: number = 0;
  /** When true, the FAB renders as disabled and cannot open the dialog. */
  export let disabled: boolean = false;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  export let hidden: boolean = false;
  /** Launcher label. Default `'Feedback'`. Hidden visually when `compact`. */
  export let label: string = 'Feedback';
  /** Force a palette regardless of the OS `prefers-color-scheme` setting. */
  export let theme: 'light' | 'dark' | 'system' = 'system';
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  export let onSubmit: ((result: SubmitResult) => void) | undefined = undefined;

  // File attachment cap. Keep in sync with MAX_ATTACHMENT_COUNT in
  // packages/sdk/src/submit.ts and the React adapter's constant.
  const MAX_ATTACHMENTS = 5;

  // Per-row `animation-delay` stagger (ms) so the staged-status rows fade
  // in sequentially; skipped under prefers-reduced-motion.
  const STATUS_ROW_STAGGER_MS = 200;

  // Phase ordinal mirrored from the React adapter (#74). Row 3
  // ("Formatting with AI") has its own exact-match rule.
  const PHASE_RANK: Record<string, number> = {
    idle: 0,
    capturing: 1,
    sanitising: 2,
    formatting: 3,
    sent: 4,
    error: -1,
  };

  // Resolved during component init so getContext() finds the parent layout's
  // setBrevwickContext call — Svelte requires getContext to run on the
  // initialisation call stack, not from inside onMount.
  const feedback = getFeedback();
  const status = feedback.status;
  const phase = feedback.phase;
  const submitErrorTagged = feedback.error;

  /** One bubble in the conversation thread (React's Message shape). */
  type Message = {
    id: string;
    role: 'assistant' | 'user';
    text: string;
    sentAt?: number;
    issueSent?: boolean;
    /**
     * Exact post-redaction payload the SDK POSTed — set only under
     * `config.debug`; renders a "copy raw payload" affordance.
     */
    rawPayload?: Record<string, unknown>;
  };

  const GREETING: Message = {
    id: 'greeting',
    role: 'assistant',
    text: "Hi! Tell us what's happening.",
  };
  const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';

  // Maximum autogrow height of the composer textarea in pixels. Mirrors
  // the React adapter's COMPOSER_MAX_HEIGHT_PX so the two widgets cap at
  // the same line count before scrolling internally.
  const COMPOSER_MAX_HEIGHT_PX = 120;

  let mounted = false;
  let open = false;
  let draft = '';
  let expected = '';
  let actual = '';
  let showExtras = false;
  let confirmClose = false;
  let useAi = true;
  let messages: Message[] = [GREETING];
  let files: { id: number; file: File }[] = [];
  let submitError: string | null = null;
  let fileId = 0;
  let messageId = 0;
  let prefersReducedMotion = false;
  // Bound to the composer textarea for scrollHeight-based autogrow.
  let textareaEl: HTMLTextAreaElement | undefined;

  // Project-config render-policy state. Mirrors React's `useProjectConfig`:
  // lazy fetch on first open, cached for the component's lifetime.
  type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';
  let projectConfigStatus: ProjectConfigStatus = 'idle';
  let projectConfig: ProjectConfig | null = null;
  let projectConfigTriggered = false;

  // Render-policy matrix, parity with React (#65). The toggle is visible
  // exactly when the config has loaded successfully, AI is enabled for the
  // project, AND the admin has opted submitters into the choice. Any other
  // state hides the toggle and the payload omits `use_ai`.
  $: showAiToggle =
    projectConfigStatus === 'ready' &&
    projectConfig?.ai_enabled === true &&
    projectConfig?.ai_submitter_choice_allowed === true;

  // Last submitted FeedbackInput so retry re-runs the exact same payload.
  let lastSubmittedInput: FeedbackInput | null = null;
  // User bubble id for the most recent submit, so retry can re-attach a
  // freshly composed `rawPayload` to the same bubble.
  let lastUserMessageId: string | null = null;
  // Bubble id showing "Copied!" feedback + the timer that clears it.
  let copiedRawId: string | null = null;
  let copiedRawTimeout: ReturnType<typeof setTimeout> | undefined;

  // Writable so the relative-time formatter re-runs reactively.
  const nowStore = writable<number>(Date.now());

  $: attachmentsAtCap = files.length >= MAX_ATTACHMENTS;
  $: hasContent =
    draft.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    files.length > 0;
  $: canSend = draft.trim().length > 0 && $status !== 'submitting';

  // Autogrow the composer textarea up to COMPOSER_MAX_HEIGHT_PX. Reset to
  // `auto` first so shrinking on backspace works (parity with React).
  $: if (textareaEl && draft !== undefined) {
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }

  // Phase-driven row visibility, parity with React. The retry row owns
  // the `error` phase exclusively.
  $: phaseRank = PHASE_RANK[$phase] ?? 0;
  $: showCaptured = phaseRank >= PHASE_RANK.sanitising;
  $: showSanitised = phaseRank >= PHASE_RANK.formatting;
  $: showFormatting = $phase === 'formatting' && projectConfig?.ai_enabled === true;
  $: showRetryRow = $phase === 'error' && $submitErrorTagged !== null;

  onMount(() => {
    mounted = true;
    if (typeof window !== 'undefined' && window.matchMedia) {
      prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
    }
  });

  onDestroy(() => {
    // Defence-in-depth: ensure the Escape keydown listener is detached
    // even if the component unmounts while the panel is still open.
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleWindowKeydown);
    }
    if (copiedRawTimeout) clearTimeout(copiedRawTimeout);
  });

  // Lazy project-config fetch on first panel open; later opens reuse the
  // cached result (the SDK also caches per session).
  $: if (open && !projectConfigTriggered) {
    projectConfigTriggered = true;
    projectConfigStatus = 'loading';
    feedback
      .getConfig()
      .then((cfg) => {
        projectConfigStatus = 'ready';
        projectConfig = cfg;
      })
      .catch(() => {
        // getConfig never rejects in the documented contract, but stay
        // defensive so a future regression cannot wedge the widget in
        // 'loading' forever.
        projectConfigStatus = 'error';
        projectConfig = null;
      });
  }

  function newMessageId(): string {
    messageId += 1;
    return `msg-${messageId}`;
  }

  /**
   * Stamp the dev-only raw payload onto a user bubble once `submit()`
   * resolves. No-op unless the host enabled `config.debug` (the SDK only
   * populates `result.debug` then), so this is inert in production.
   */
  function attachRawPayload(messageId: string, result: SubmitResult): void {
    const payload = result.debug?.payload;
    if (!payload) return;
    messages = messages.map((m) =>
      m.id === messageId ? { ...m, rawPayload: payload } : m,
    );
  }

  /**
   * Copy the dev-only raw payload (the exact, post-redaction JSON body POSTed
   * to the ingest endpoint) to the clipboard. Pretty-printed with a two-space
   * indent; the parsed JSON matches what was sent over the wire (only the
   * whitespace differs from the unindented request body). Degrades to a no-op
   * where the async clipboard API is missing.
   */
  function copyRaw(message: Message): void {
    if (!message.rawPayload) return;
    const json = JSON.stringify(message.rawPayload, null, 2);
    const clip =
      navigator.clipboard;
    if (!clip) return;
    void clip.writeText(json).then(
      () => {
        copiedRawId = message.id;
        if (copiedRawTimeout) clearTimeout(copiedRawTimeout);
        copiedRawTimeout = setTimeout(() => {
          copiedRawId = null;
        }, 1500);
      },
      () => {
        /* clipboard write rejected (permissions) — leave the label as is */
      },
    );
  }

  function resetAll(): void {
    draft = '';
    expected = '';
    actual = '';
    showExtras = false;
    files = [];
    confirmClose = false;
    submitError = null;
    messages = [GREETING];
    useAi = true;
    lastSubmittedInput = null;
    feedback.reset();
  }

  function toggleOpen(): void {
    if (disabled) return;
    open = !open;
    if (open) {
      submitError = null;
    }
  }

  /**
   * Minimize: hide the panel but preserve every piece of composer state
   * (draft, expected/actual, attachments, AI toggle, in-flight phase). The
   * × button handles the dirty-confirm flow; this is the Esc / minimize
   * affordance equivalent to React's handleMinimize.
   */
  function minimizePanel(): void {
    open = false;
    confirmClose = false;
    submitError = null;
  }

  /**
   * Full close: clears every piece of state and resets the thread back to
   * the greeting. Routed through here from the × button (when clean) and
   * from "Discard" inside the discard-confirm.
   */
  function fullClose(): void {
    open = false;
    resetAll();
  }

  function handleCloseClick(): void {
    if ($status === 'submitting') return;
    if (hasContent) {
      confirmClose = true;
      return;
    }
    fullClose();
  }

  // Escape-to-close: parity with the React adapter (Radix Dialog ships this
  // for free). Listener is attached only while the panel is open and is
  // detached the moment it closes or the component unmounts. Esc maps to
  // minimize so the user's draft survives an accidental keypress.
  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      minimizePanel();
    }
  }

  $: if (typeof window !== 'undefined') {
    if (open) {
      window.addEventListener('keydown', handleWindowKeydown);
    } else {
      window.removeEventListener('keydown', handleWindowKeydown);
    }
  }

  function handleFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list || list.length === 0) return;
    const remaining = MAX_ATTACHMENTS - files.length;
    if (remaining <= 0) {
      input.value = '';
      return;
    }
    const next: { id: number; file: File }[] = [];
    for (let i = 0; i < Math.min(remaining, list.length); i++) {
      // Indexed access works on both real FileList and happy-dom's stub;
      // `list.item(i)` would fail under happy-dom which omits the method.
      const file = list[i];
      if (file) {
        fileId += 1;
        next.push({ id: fileId, file });
      }
    }
    files = [...files, ...next];
    input.value = '';
  }

  function removeFile(id: number): void {
    files = files.filter((f) => f.id !== id);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSend) return;
    if (!draft.trim()) {
      submitError = 'Please describe what happened.';
      return;
    }
    submitError = null;

    const attachments: Array<Blob | FeedbackAttachment> = [];
    for (const { file } of files)
      attachments.push({ blob: file, filename: file.name });

    // Submit what the user actually sees in their bubble — trimming would
    // drop the user's intentional whitespace/newlines on the wire. The
    // `canSend` check above already rejects whitespace-only drafts; for
    // title derivation we still want the first non-empty line trimmed.
    const derivedTitle = (draft.trim().split('\n', 1)[0] ?? '').slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description: draft,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      // use_ai rides the payload only when the submitter has been given
      // the choice; in every other render state we leave the server-side
      // default alone.
      ...(showAiToggle ? { use_ai: useAi } : {}),
    };

    // Push the user's draft into the conversation immediately and clear
    // the composer BEFORE awaiting submit(). The visual progression is
    // what makes the wait feel fast — a synchronous bubble + cleared
    // input lets the staged-status rows below carry the rest of the
    // animation while the network round-trip is in flight (#74).
    const userBubble: Message = {
      id: newMessageId(),
      role: 'user',
      text: draft,
    };
    messages = [...messages, userBubble];

    const submittedFileIds = new Set(files.map((f) => f.id));

    draft = '';
    expected = '';
    actual = '';
    showExtras = false;
    lastSubmittedInput = input;
    lastUserMessageId = userBubble.id;

    try {
      const result = await feedback.submit(input);
      onSubmit?.(result);
      attachRawPayload(userBubble.id, result);
      if (result.ok) {
        const assistant: Message = {
          id: newMessageId(),
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        messages = [...messages, assistant];
        // If the user minimized mid-submit, pop the panel back open so the
        // success confirmation is actually seen.
        open = true;
        // Drop the live composer attachments now they have ridden along
        // with the submit.
        files = files.filter((f) => !submittedFileIds.has(f.id));
        // Refresh the relative-time anchor so the receipt's "just now"
        // is computed against the same Date.now we just stamped.
        nowStore.set(Date.now());
      } else {
        // Failure: the user bubble is already in the thread; the staged
        // rows collapse into a red retry row driven by `phase === 'error'`
        // + the `error` store carrying the SubmitError. Pop the panel
        // back open so the user sees the retry CTA. The inline `submitError`
        // alert is reserved for validation / capture errors raised
        // synchronously by the widget itself (matches React's split).
        open = true;
      }
    } catch {
      // Chunk-load failure path — context.ts has already flipped phase to
      // `'error'` and stored a synthetic SubmitError. Pop the panel back
      // open so the retry row is visible. Same split as the ok:false path:
      // the retry row owns the message, `submitError` stays reserved for
      // synchronous validation / capture errors.
      open = true;
    }
  }

  /**
   * Re-run the most recent submit with the original `FeedbackInput`. The
   * user bubble is already in the thread (pushed on the first Send), so
   * the retry path only needs to re-fire `submit()` and append the
   * assistant receipt on success — no duplicate bubble for the retry.
   */
  async function handleRetry(): Promise<void> {
    if (!lastSubmittedInput) return;
    if ($status === 'submitting') return;
    submitError = null;
    try {
      const result = await feedback.retry();
      if (!result) return;
      onSubmit?.(result);
      if (lastUserMessageId) attachRawPayload(lastUserMessageId, result);
      if (result.ok) {
        const assistant: Message = {
          id: newMessageId(),
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        messages = [...messages, assistant];
        nowStore.set(Date.now());
        open = true;
      } else {
        open = true;
      }
    } catch {
      open = true;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function toggleExtras(): void {
    showExtras = !showExtras;
  }

  function toggleAi(): void {
    if ($status === 'submitting') return;
    useAi = !useAi;
  }

  function handleAiKeydown(event: KeyboardEvent): void {
    // Space toggles when focused (default browser behaviour on
    // role="button" is Enter and Space, but Space carries fewer collisions
    // with the composer's Enter-to-send shortcut).
    if (event.key === ' ') {
      event.preventDefault();
      toggleAi();
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Cheap relative-time formatter for the issue-sent receipt. Parity with
   * the React adapter — the bubble doesn't auto-refresh; once rendered the
   * timestamp captures the moment the issue was queued. Intentionally does
   * not pull in `Intl.RelativeTimeFormat` or `date-fns` so the SFC gzip
   * stays inside the §12 budget.
   */
  function formatRelativeTime(ms: number | undefined, now: number): string {
    if (ms === undefined) return 'just now';
    const diffMs = now - ms;
    if (diffMs < 60_000) return 'just now';
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} d ago`;
  }

  // resolveLauncherPlacement is the single source of truth for the
  // variant/position matrix (shared shape with React).
  $: placement = resolveLauncherPlacement(variant, position);
  $: fabModifierClasses = [
    placement.variant === 'tab' ? 'brw-fab--tab' : 'brw-fab--bubble',
    placement.variant === 'tab'
      ? placement.side === 'left'
        ? 'brw-fab-l'
        : 'brw-fab-r'
      : placement.side === 'left'
        ? 'brw-fab-bl'
        : 'brw-fab-br',
    compact ? 'brw-fab--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
  $: panelPosClass =
    placement.side === 'left' ? 'brw-panel-bl' : 'brw-panel-br';
  // Compact removes the visible text, so `label` becomes the aria-label;
  // non-compact keeps the established accessible name (parity with React).
  $: fabAriaLabel = compact ? label : 'Open feedback form';

  // Per-instance ID for the disclosure aria-controls relationship. Stays
  // stable across re-renders so AT focus tracking doesn't churn. Uses a
  // module-scoped counter so two FeedbackButtons on the same page don't
  // collide on a shared DOM id.
  const disclosureId = `brw-svelte-disclosure-${++disclosureSeq}`;
</script>

{#if !hidden && mounted}
  <div class="brw-svelte-root" data-brw-theme={theme} data-brevwick-skip>
    {#if open}
      <div
        class="brw-svelte-panel {panelPosClass}"
        role="dialog"
        aria-modal="false"
        aria-label="Send feedback"
        data-brevwick-skip
      >
        <header class="brw-svelte-header">
          <span class="brw-svelte-avatar" aria-hidden="true">B</span>
          <span class="brw-svelte-title">Send feedback</span>
          <button
            type="button"
            class="brw-svelte-icon-btn"
            aria-label="Minimize"
            on:click={minimizePanel}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 14h14" />
            </svg>
          </button>
          <button
            type="button"
            class="brw-svelte-icon-btn"
            aria-label="Close"
            on:click={handleCloseClick}
            disabled={$status === 'submitting'}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div class="brw-svelte-thread" role="log" aria-live="polite">
          {#each messages as message (message.id)}
            {#if message.role === 'assistant'}
              <div class="brw-svelte-bubble brw-svelte-bubble--assistant">
                {message.text}
                {#if message.issueSent}
                  <div class="brw-svelte-bubble--receipt">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Issue sent · {formatRelativeTime(message.sentAt, $nowStore)}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="brw-svelte-bubble brw-svelte-bubble--user">
                {message.text}
                {#if message.rawPayload !== undefined}
                  <button
                    type="button"
                    class="brw-svelte-copy-raw"
                    aria-label="Copy the raw payload sent to the API"
                    data-brw-copy-raw
                    on:click={() => copyRaw(message)}
                  >
                    {copiedRawId === message.id ? 'Copied!' : 'Copy raw payload'}
                  </button>
                {/if}
              </div>
            {/if}
          {/each}

          {#each files as f (f.id)}
            <div class="brw-svelte-chip">
              <span class="brw-svelte-chip-name">{f.file.name}</span>
              <span class="brw-svelte-chip-size">{formatSize(f.file.size)}</span>
              <button
                type="button"
                class="brw-svelte-chip-remove"
                aria-label={`Remove ${f.file.name}`}
                on:click={() => removeFile(f.id)}
              >
                ×
              </button>
            </div>
          {/each}

          <button
            type="button"
            class="brw-svelte-disclosure"
            aria-expanded={showExtras}
            aria-controls={disclosureId}
            on:click={toggleExtras}
          >
            {showExtras ? 'Hide expected vs actual' : 'Add expected vs actual'}
          </button>
          {#if showExtras}
            <div id={disclosureId} class="brw-svelte-disclosure-panel">
              <label>
                <span class="brw-svelte-disclosure-label">Expected</span>
                <textarea
                  class="brw-svelte-disclosure-input"
                  rows={2}
                  bind:value={expected}
                ></textarea>
              </label>
              <label>
                <span class="brw-svelte-disclosure-label">Actual</span>
                <textarea
                  class="brw-svelte-disclosure-input"
                  rows={2}
                  bind:value={actual}
                ></textarea>
              </label>
            </div>
          {/if}

          {#if submitError}
            <div class="brw-svelte-error" role="alert">{submitError}</div>
          {/if}

          {#if showCaptured || showSanitised || showFormatting}
            <div class="brw-svelte-status-rows">
              {#if showCaptured}
                <div
                  class="brw-svelte-status-row"
                  data-brw-row="captured"
                  style="animation-delay: 0ms;"
                >
                  <span class="brw-svelte-status-row-check" aria-hidden="true">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span class="brw-svelte-status-row-label"
                    >Captured route, console, network, device</span
                  >
                </div>
              {/if}
              {#if showSanitised}
                <div
                  class="brw-svelte-status-row"
                  data-brw-row="sanitised"
                  style="animation-delay: {prefersReducedMotion
                    ? 0
                    : STATUS_ROW_STAGGER_MS}ms;"
                >
                  <span class="brw-svelte-status-row-check" aria-hidden="true">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span class="brw-svelte-status-row-label"
                    >PII-sanitised, packaged</span
                  >
                </div>
              {/if}
              {#if showFormatting}
                <div
                  class="brw-svelte-status-row"
                  data-brw-row="formatting"
                  style="animation-delay: {prefersReducedMotion
                    ? 0
                    : STATUS_ROW_STAGGER_MS * 2}ms;"
                >
                  <span class="brw-svelte-spinner" aria-hidden="true"></span>
                  <span class="brw-svelte-status-row-label"
                    >Formatting with AI…</span
                  >
                </div>
              {/if}
            </div>
          {/if}
          {#if showRetryRow && $submitErrorTagged}
            <div
              class="brw-svelte-status-row brw-svelte-status-row--error"
              role="alert"
              data-brw-error-code={$submitErrorTagged.code}
              data-brw-row="error"
            >
              {$submitErrorTagged.message}
              <button
                type="button"
                class="brw-svelte-btn brw-svelte-status-row-retry"
                on:click={handleRetry}
              >
                Retry
              </button>
            </div>
          {/if}

          {#if confirmClose}
            <div
              class="brw-svelte-confirm"
              role="alert"
              aria-label="Discard draft?"
            >
              <span class="brw-svelte-confirm-msg">Discard your feedback?</span>
              <button
                type="button"
                class="brw-svelte-btn"
                on:click={() => (confirmClose = false)}
              >
                Keep
              </button>
              <button
                type="button"
                class="brw-svelte-btn brw-svelte-btn-primary"
                on:click={fullClose}
              >
                Discard
              </button>
            </div>
          {/if}
        </div>

        <div class="brw-svelte-composer">
          <div class="brw-svelte-composer-shell">
            <label class="brw-svelte-icon-btn" aria-label="Attach file">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5"
                />
              </svg>
              <input
                type="file"
                multiple
                class="brw-svelte-file-input"
                on:change={handleFiles}
                disabled={attachmentsAtCap || $status === 'submitting'}
                aria-label={attachmentsAtCap
                  ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
                  : 'Attach file'}
              />
            </label>
            <textarea
              bind:this={textareaEl}
              class="brw-svelte-textarea"
              rows={1}
              placeholder="Describe the bug or feedback…"
              bind:value={draft}
              on:keydown={handleKeydown}
              aria-label="Feedback message"
              disabled={$status === 'submitting'}
            ></textarea>
            {#if showAiToggle}
              <span class="brw-svelte-aitoggle-wrap">
                <button
                  type="button"
                  role="switch"
                  aria-checked={useAi}
                  aria-label="Format with AI"
                  class="brw-svelte-aitoggle{useAi
                    ? ' brw-svelte-aitoggle--on'
                    : ''}"
                  disabled={$status === 'submitting'}
                  on:click={toggleAi}
                  on:keydown={handleAiKeydown}
                >
                  <span class="brw-svelte-aitoggle-thumb" aria-hidden="true"
                  ></span>
                </button>
                <span class="brw-svelte-aitoggle-text" aria-hidden="true"
                  >AI</span
                >
              </span>
            {/if}
            <button
              type="button"
              class="brw-svelte-send"
              aria-label="Send"
              on:click={handleSubmit}
              disabled={!canSend}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20l16-8L4 4l2 8-2 8z" />
                <path d="M6 12h14" />
              </svg>
            </button>
          </div>
        </div>

        <footer class="brw-svelte-footer">
          <a
            class="brw-svelte-footer-link"
            href="https://brevwick.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Brevwick v{BREVWICK_SVELTE_VERSION}
          </a>
        </footer>
      </div>
    {/if}

    <!-- --brw-fab-tab-offset is a positioning input, not part of the
         public --brw-* theming contract — set only when it has an effect. -->
    <button
      type="button"
      class="brw-svelte-fab {fabModifierClasses}"
      data-brevwick-skip
      data-testid="brw-svelte-fab"
      data-brw-variant={placement.variant}
      aria-label={fabAriaLabel}
      style:--brw-fab-tab-offset={placement.variant === 'tab' && offset !== 0
        ? `${offset}px`
        : undefined}
      {disabled}
      on:click={toggleOpen}
    >
      <svg
        class="brw-fab-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      {#if !compact}<span class="brw-fab-label">{label}</span>{/if}
    </button>
  </div>
{/if}

<script lang="ts" context="module">
  // Module-scoped counter for the disclosure id. Resets per page-load,
  // collisions across multiple <FeedbackButton> instances are impossible
  // because each `++` produces a fresh integer for that page lifetime.
  let disclosureSeq = 0;
</script>

<style>
  /* Public theme tokens, mirrored from the React adapter so the same
     `--brw-*` overrides re-skin both widgets. Defaults are scoped to the
     widget root so a host page's design system is unaffected. */
  .brw-svelte-root {
    --brw-fg: #0b0b0c;
    --brw-fg-muted: #6b7280;
    --brw-bg: #ffffff;
    --brw-panel-bg: var(--brw-bg);
    --brw-bubble-assistant-bg: #f3f4f6;
    --brw-bubble-user-bg: #0f172a;
    --brw-bubble-user-fg: #ffffff;
    --brw-chip-bg: #f3f4f6;
    --brw-composer-bg: #ffffff;
    --brw-border: #e5e7eb;
    --brw-border-focus: #818cf8;
    --brw-divider: #e5e7eb;
    --brw-accent: #4f46e5;
    --brw-accent-fg: #ffffff;
    --brw-error: #b91c1c;
    /* Checklist tick colour. Widget-internal by design — no public
       --brw-success knob; host overrides flow through --brw-accent. */
    --brw-success: #10b981;
    --brw-shadow:
      0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.12);
    color: var(--brw-fg);
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif;
    font-size: 14px;
  }

  /* `data-brw-theme='system'` resolves via the @media block below;
     `data-brw-theme='dark'` forces dark via the explicit override. */
  .brw-svelte-root[data-brw-theme='dark'] {
    --brw-fg: #f3f4f6;
    --brw-fg-muted: #9ca3af;
    --brw-bg: #0b0b0c;
    --brw-panel-bg: #111113;
    --brw-bubble-assistant-bg: #1f2024;
    --brw-bubble-user-bg: #f8fafc;
    --brw-bubble-user-fg: #0f172a;
    --brw-chip-bg: #1f2024;
    --brw-composer-bg: #111113;
    --brw-border: #2a2b30;
    --brw-divider: #2a2b30;
    --brw-accent: #818cf8;
    --brw-accent-fg: #0b0b0c;
    /* Brighter emerald (500→400) keeps the tick legible on dark panels. */
    --brw-success: #34d399;
  }

  @media (prefers-color-scheme: dark) {
    .brw-svelte-root[data-brw-theme='system'] {
      --brw-fg: #f3f4f6;
      --brw-fg-muted: #9ca3af;
      --brw-bg: #0b0b0c;
      --brw-panel-bg: #111113;
      --brw-bubble-assistant-bg: #1f2024;
      --brw-bubble-user-bg: #f8fafc;
      --brw-bubble-user-fg: #0f172a;
      --brw-chip-bg: #1f2024;
      --brw-composer-bg: #111113;
      --brw-border: #2a2b30;
      --brw-divider: #2a2b30;
      --brw-accent: #818cf8;
      --brw-accent-fg: #0b0b0c;
      --brw-success: #34d399;
    }
  }

  /* Shared launcher chrome — variant geometry lives on .brw-fab--bubble /
     .brw-fab--tab (mirrors the React adapter's .brw-fab split). */
  .brw-svelte-fab {
    position: fixed;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--brw-border);
    background: var(--brw-panel-bg);
    color: var(--brw-fg);
    box-shadow: var(--brw-shadow);
    cursor: pointer;
    font: inherit;
    z-index: 2147483646;
    transition: transform 120ms ease-out;
  }
  .brw-svelte-fab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* Ring sits 2px outside the box so it clears the tab's flat edge. */
  .brw-svelte-fab:focus-visible {
    outline: 2px solid var(--brw-border-focus);
    outline-offset: 2px;
  }
  .brw-svelte-fab .brw-fab-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  /* Bubble — legacy corner pill. */
  .brw-svelte-fab.brw-fab--bubble {
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    padding: 10px 16px;
    border-radius: 999px;
  }
  .brw-svelte-fab.brw-fab--bubble:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .brw-svelte-fab.brw-fab-br {
    right: calc(24px + env(safe-area-inset-right, 0px));
  }
  .brw-svelte-fab.brw-fab-bl {
    left: calc(24px + env(safe-area-inset-left, 0px));
  }
  .brw-svelte-fab.brw-fab--bubble.brw-fab--compact {
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }

  /* Tab — vertical edge tab, the new default. writing-mode stacks the
     icon + label vertically; the left tab adds `rotate: 180deg` (the
     standalone property, NOT transform, so it composes with the hover
     translateX) to mirror the flat edge and radii automatically. */
  .brw-svelte-fab.brw-fab--tab {
    top: calc(50% + var(--brw-fab-tab-offset, 0px));
    transform: translateY(-50%);
    writing-mode: vertical-rl;
    min-height: 48px;
    width: 40px;
    padding: 16px 0;
    justify-content: center;
    /* Rounded page-facing side, flat against the viewport edge. */
    border-radius: 10px 0 0 10px;
  }
  .brw-svelte-fab.brw-fab-r {
    right: env(safe-area-inset-right, 0px);
    border-right: none; /* flat edge: no hairline against the viewport */
  }
  .brw-svelte-fab.brw-fab-l {
    left: env(safe-area-inset-left, 0px);
    border-right: none; /* pre-rotation right edge IS the viewport edge */
    rotate: 180deg;
  }
  /* Hover pulls the tab 2px out of its edge (the left tab's rotate flips
     the sign); translateY(-50%) must be restated, transform overwrites. */
  .brw-svelte-fab.brw-fab--tab:hover:not(:disabled) {
    transform: translateY(-50%) translateX(-2px);
  }
  .brw-svelte-fab .brw-fab-label {
    letter-spacing: 0.02em;
  }
  .brw-svelte-fab.brw-fab--tab.brw-fab--compact {
    width: 44px;
    min-height: 44px;
    padding: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .brw-svelte-fab {
      transition: none;
    }
  }

  /* Anchored at the FAB's corner offset so the panel's higher z-index
     covers the FAB while open (parity with React's Radix Dialog). */
  .brw-svelte-panel {
    position: fixed;
    bottom: 24px;
    width: min(92vw, 400px);
    height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--brw-panel-bg);
    color: var(--brw-fg);
    border: 1px solid var(--brw-border);
    border-radius: 16px;
    box-shadow: var(--brw-shadow);
    overflow: hidden;
    z-index: 2147483647;
  }
  .brw-svelte-panel.brw-panel-br {
    right: 24px;
  }
  .brw-svelte-panel.brw-panel-bl {
    left: 24px;
  }
  @media (max-width: 480px) {
    .brw-svelte-panel {
      width: calc(100vw - 32px);
      left: 16px;
      right: 16px;
    }
  }

  .brw-svelte-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--brw-divider);
  }
  .brw-svelte-avatar {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--brw-accent);
    color: var(--brw-accent-fg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 12px;
  }
  .brw-svelte-title {
    flex: 1;
    font-weight: 600;
  }
  .brw-svelte-icon-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--brw-fg);
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font: inherit;
    font-size: 18px;
  }
  .brw-svelte-icon-btn:hover {
    background: var(--brw-bubble-assistant-bg);
  }
  .brw-svelte-icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .brw-svelte-thread {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .brw-svelte-bubble {
    padding: 8px 12px;
    border-radius: 12px;
    max-width: 100%;
    line-height: 1.4;
    word-wrap: break-word;
    white-space: pre-wrap;
  }
  .brw-svelte-bubble--assistant {
    background: var(--brw-bubble-assistant-bg);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .brw-svelte-bubble--user {
    align-self: flex-end;
    background: var(--brw-bubble-user-bg);
    color: var(--brw-bubble-user-fg);
    border-bottom-right-radius: 4px;
  }
  .brw-svelte-bubble--receipt {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--brw-fg-muted);
  }
  .brw-svelte-bubble--receipt svg {
    flex-shrink: 0;
  }
  /* Dev-only "copy raw payload" button (config.debug). Sits under the bubble
     text, muted, so it never competes with real widget chrome. */
  .brw-svelte-copy-raw {
    display: block;
    margin-top: 6px;
    padding: 2px 6px;
    font: inherit;
    font-size: 11px;
    line-height: 1.4;
    background: transparent;
    border: 1px solid var(--brw-bubble-user-fg);
    border-radius: 6px;
    color: var(--brw-bubble-user-fg);
    opacity: 0.7;
    cursor: pointer;
  }
  .brw-svelte-copy-raw:hover {
    opacity: 1;
  }

  .brw-svelte-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--brw-chip-bg);
    border-radius: 8px;
    align-self: flex-start;
    max-width: 100%;
  }
  .brw-svelte-chip-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .brw-svelte-chip-size {
    color: var(--brw-fg-muted);
    font-size: 12px;
  }
  .brw-svelte-chip-remove {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--brw-fg-muted);
    cursor: pointer;
    font: inherit;
    font-size: 16px;
    padding: 0 4px;
  }

  .brw-svelte-error {
    color: var(--brw-error);
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }

  .brw-svelte-disclosure {
    align-self: flex-start;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--brw-fg-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
  .brw-svelte-disclosure:hover {
    color: var(--brw-fg);
  }
  .brw-svelte-disclosure-panel {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: var(--brw-chip-bg);
    border: 1px solid var(--brw-border);
    border-radius: 10px;
  }
  .brw-svelte-disclosure-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--brw-fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .brw-svelte-disclosure-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    font: inherit;
    font-size: 12px;
    color: var(--brw-fg);
    background: var(--brw-panel-bg);
    border: 1px solid var(--brw-border);
    border-radius: 6px;
    resize: vertical;
    min-height: 34px;
  }

  /* Staged-status rows: a stacked checklist under a dashed divider,
     intentionally outside the bubble class family so message-count
     queries ignore them. animation-delay is set inline per row so the
     rows fade in sequentially even when SDK phase events fire
     microseconds apart; reduced-motion collapses the entrance. */
  .brw-svelte-status-rows {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px dashed var(--brw-divider);
  }
  .brw-svelte-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--brw-fg-muted);
    animation: brw-svelte-status-row-in 220ms ease-out both;
  }
  .brw-svelte-status-row-check {
    display: inline-flex;
    width: 12px;
    height: 12px;
    align-items: center;
    justify-content: center;
    color: var(--brw-success);
    flex-shrink: 0;
  }
  .brw-svelte-status-row-check svg {
    width: 12px;
    height: 12px;
  }
  /* Downsize the shared 14px spinner to match the 12px ticks. */
  .brw-svelte-status-row .brw-svelte-spinner {
    width: 12px;
    height: 12px;
  }
  .brw-svelte-status-row-label {
    flex: 1;
  }
  /* Retry row: a standalone alert outside the checklist container, with
     its own chrome; transparent bg so it reads as an alert overlay. */
  .brw-svelte-status-row--error {
    align-self: stretch;
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    color: var(--brw-error);
    border: 1px solid var(--brw-error);
    font-size: 13px;
    line-height: 1.45;
  }
  .brw-svelte-status-row-retry {
    margin-left: auto;
    padding: 4px 10px;
    font-size: 12px;
  }
  @keyframes brw-svelte-status-row-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .brw-svelte-status-row {
      animation: none;
    }
  }

  /* Inline `role="alert"` confirm — not a true modal dialog. Same shape
     as the React DiscardConfirm; "Keep" is the non-destructive default. */
  .brw-svelte-confirm {
    align-self: stretch;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    background: var(--brw-chip-bg);
    border: 1px solid var(--brw-border);
    border-radius: 10px;
    font-size: 12px;
  }
  .brw-svelte-confirm-msg {
    flex: 1;
  }
  .brw-svelte-btn {
    height: 28px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--brw-border);
    background: var(--brw-panel-bg);
    color: var(--brw-fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .brw-svelte-btn:hover:not(:disabled) {
    background: var(--brw-chip-bg);
  }
  .brw-svelte-btn-primary {
    background: var(--brw-accent);
    color: var(--brw-accent-fg);
    border-color: var(--brw-accent);
  }

  /* Spinner for the AI formatting status row. Matches React's brw-spinner
     shape. */
  .brw-svelte-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 999px;
    animation: brw-svelte-spin 0.7s linear infinite;
  }
  @keyframes brw-svelte-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .brw-svelte-spinner {
      animation-duration: 1.6s;
    }
  }

  /* Outer composer is the bottom strip; the unified input chip (attach,
     textarea, AI toggle, send on one row) lives in -composer-shell.
     Mirrors React's .brw-composer / .brw-composer-shell split (#114). */
  .brw-svelte-composer {
    flex-shrink: 0;
    padding: 8px 10px;
    background: var(--brw-composer-bg);
    border-top: 1px solid var(--brw-divider);
  }
  .brw-svelte-composer-shell {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding: 6px 8px;
    background: var(--brw-composer-bg);
    border: 1px solid var(--brw-border);
    border-radius: 12px;
    transition: border-color 120ms ease-out;
  }
  .brw-svelte-composer-shell:focus-within {
    border-color: var(--brw-border-focus);
  }
  @media (prefers-reduced-motion: reduce) {
    .brw-svelte-composer-shell {
      transition: none;
    }
  }
  .brw-svelte-textarea {
    flex: 1;
    min-height: 34px;
    max-height: 120px;
    box-sizing: border-box;
    padding: 8px 4px;
    background: transparent;
    color: var(--brw-fg);
    border: none;
    resize: none;
    overflow-y: auto;
    line-height: 1.4;
    font: inherit;
    font-size: 13px;
  }
  .brw-svelte-textarea:focus,
  .brw-svelte-textarea:focus-visible {
    outline: none;
  }
  .brw-svelte-send {
    width: 34px;
    height: 34px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--brw-accent);
    background: var(--brw-accent);
    color: var(--brw-accent-fg);
    border-radius: 10px;
    cursor: pointer;
    flex-shrink: 0;
    font: inherit;
  }
  .brw-svelte-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .brw-svelte-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* AI toggle — track-and-thumb switch, parity with React (#65). The
     "AI" text sits outside the button; the wrap matches the send
     button's 34px height so both centre on the same baseline. */
  .brw-svelte-aitoggle-wrap {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 4px;
  }
  .brw-svelte-aitoggle-text {
    font-size: 12px;
    font-weight: 500;
    color: var(--brw-fg-muted);
    line-height: 1;
    user-select: none;
    transition: color 120ms ease-out;
  }
  .brw-svelte-aitoggle-wrap:has(.brw-svelte-aitoggle--on)
    .brw-svelte-aitoggle-text {
    color: var(--brw-fg);
  }
  .brw-svelte-aitoggle {
    position: relative;
    flex-shrink: 0;
    width: 30px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid var(--brw-border);
    background: var(--brw-chip-bg);
    cursor: pointer;
    transition:
      background-color 120ms ease-out,
      border-color 120ms ease-out;
  }
  .brw-svelte-aitoggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .brw-svelte-aitoggle-thumb {
    position: absolute;
    top: 50%;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--brw-fg-muted);
    transform: translateY(-50%);
    transition:
      left 140ms ease-out,
      background-color 120ms ease-out;
  }
  .brw-svelte-aitoggle--on {
    background: var(--brw-accent);
    border-color: var(--brw-accent);
  }
  .brw-svelte-aitoggle--on .brw-svelte-aitoggle-thumb {
    left: calc(100% - 14px);
    background: var(--brw-accent-fg);
  }
  @media (prefers-reduced-motion: reduce) {
    .brw-svelte-aitoggle,
    .brw-svelte-aitoggle-thumb,
    .brw-svelte-aitoggle-text {
      transition: none;
    }
  }

  .brw-svelte-footer {
    padding: 6px 12px 10px;
    text-align: center;
    border-top: 1px solid var(--brw-divider);
  }
  .brw-svelte-footer-link {
    color: var(--brw-fg-muted);
    font-size: 11px;
    text-decoration: none;
  }
</style>
