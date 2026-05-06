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

  // Props use Svelte's `export let` (legacy mode under Svelte 5) rather
  // than `$props()` runes. This keeps the SFC compiling under both legacy
  // and runes-mode hosts: Svelte 5 supports `export let` cleanly in legacy
  // mode, and a runes-mode parent simply sees the same prop interface.
  // We will revisit when Svelte 6 (rune-only) lands.
  /** Corner the FAB pins to. Default `'bottom-right'`. */
  export let position: 'bottom-right' | 'bottom-left' = 'bottom-right';
  /** When true, the FAB renders as disabled and cannot open the dialog. */
  export let disabled: boolean = false;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  export let hidden: boolean = false;
  /** FAB label. Default `'Feedback'`. */
  export let label: string = 'Feedback';
  /** Force a palette regardless of the OS `prefers-color-scheme` setting. */
  export let theme: 'light' | 'dark' | 'system' = 'system';
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  export let onSubmit: ((result: SubmitResult) => void) | undefined = undefined;

  // File attachment cap. Keep in sync with MAX_ATTACHMENT_COUNT in
  // packages/sdk/src/submit.ts (not exported on the SDK's frozen public
  // surface) and the matching constant in packages/react/src/feedback-button.tsx.
  // Enforced in the UI so the user can't queue an attachment the SDK would
  // reject downstream.
  const MAX_ATTACHMENTS = 5;

  // Stagger between staged-status rows in milliseconds. Mirrors the React
  // adapter (#74). Honoured only when the user has not requested reduced
  // motion — see `prefersReducedMotion` below.
  const STATUS_ROW_STAGGER_MS = 200;

  // Phase ordinal mirrored from the React adapter (#74). Row 1 ("Captured")
  // shows from `'sanitising'` onwards, row 2 ("Sanitised") from
  // `'formatting'` onwards. Row 3 ("Formatting with AI") has its own
  // exact-match rule and does not consult this table.
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

  /**
   * One bubble in the conversation thread. The greeting and submitted-issue
   * receipt are `assistant` messages; submitted drafts become `user`
   * messages. Mirrors the React adapter's Message shape.
   */
  type Message = {
    id: string;
    role: 'assistant' | 'user';
    text: string;
    sentAt?: number;
    issueSent?: boolean;
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
  // Bound to the composer textarea so the autogrow reactive block can
  // measure scrollHeight and resize between min-height (one row) and
  // COMPOSER_MAX_HEIGHT_PX without coupling to a CSS-only grow that
  // would jump in row-sized increments.
  let textareaEl: HTMLTextAreaElement | undefined;

  // Project-config render-policy state. Mirrors React's `useProjectConfig`:
  // lazy fetch on first panel open, cache the result for the lifetime of the
  // component. The fetch is gated behind the open-state to preserve the
  // widget's "zero-cost until opened" property.
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

  // Last submitted FeedbackInput so the retry path can re-run the exact same
  // payload without forcing the user to re-type the draft we cleared
  // synchronously on Send.
  let lastSubmittedInput: FeedbackInput | null = null;

  // Receipt timestamps live in a writable so the relative-time formatter
  // re-runs reactively without coupling to the message identity. Mirrors
  // the React `formatRelativeTime` reading `Date.now()` once at render.
  const nowStore = writable<number>(Date.now());

  $: attachmentsAtCap = files.length >= MAX_ATTACHMENTS;
  $: hasContent =
    draft.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    files.length > 0;
  $: canSend = draft.trim().length > 0 && $status !== 'submitting';

  // Autogrow the composer textarea between one row and
  // COMPOSER_MAX_HEIGHT_PX as the user types. Mirrors the React adapter:
  // reset to `auto` first so shrinking on backspace works, then size to
  // `scrollHeight` capped at the ceiling.
  $: if (textareaEl && draft !== undefined) {
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }

  // Phase-driven row visibility. Parity with the React adapter — row 1
  // shows from `sanitising` onwards, row 2 from `formatting` onwards, row
  // 3 only during the exact `formatting` phase (and only when the project
  // has AI enabled). The retry row owns the `error` phase exclusively.
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
  });

  // Lazy project-config fetch on first panel open. Subsequent opens reuse
  // the cached result. Mirrors the React adapter's useProjectConfig — the
  // SDK itself caches per session, so the second call would no-op anyway,
  // but tracking here avoids an extra awaited microtask on every open.
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

    try {
      const result = await feedback.submit(input);
      onSubmit?.(result);
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

  // Reactive so the FAB / panel CSS classes re-derive when `position` changes.
  $: fabPosClass = position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  $: panelPosClass =
    position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';

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

          {#if showCaptured}
            <div
              class="brw-svelte-status-row"
              data-brw-row="captured"
              style="transition-delay: 0ms; animation-delay: 0ms;"
            >
              <span class="brw-svelte-status-row-check" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
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
              style="transition-delay: {prefersReducedMotion
                ? 0
                : STATUS_ROW_STAGGER_MS}ms; animation-delay: {prefersReducedMotion
                ? 0
                : STATUS_ROW_STAGGER_MS}ms;"
            >
              <span class="brw-svelte-status-row-check" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
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
              <span class="brw-svelte-status-row-label">PII-sanitised, packaged</span>
            </div>
          {/if}
          {#if showFormatting}
            <div
              class="brw-svelte-status-row"
              data-brw-row="formatting"
              style="transition-delay: {prefersReducedMotion
                ? 0
                : STATUS_ROW_STAGGER_MS * 2}ms; animation-delay: {prefersReducedMotion
                ? 0
                : STATUS_ROW_STAGGER_MS * 2}ms;"
            >
              <span class="brw-svelte-spinner" aria-hidden="true"></span>
              <span class="brw-svelte-status-row-label">Formatting with AI…</span>
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

    <button
      type="button"
      class="brw-svelte-fab {fabPosClass}"
      data-brevwick-skip
      data-testid="brw-svelte-fab"
      aria-label="Open feedback form"
      {disabled}
      on:click={toggleOpen}
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
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      <span>{label}</span>
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
    }
  }

  .brw-svelte-fab {
    position: fixed;
    bottom: 24px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 999px;
    border: 1px solid var(--brw-border);
    background: var(--brw-panel-bg);
    color: var(--brw-fg);
    box-shadow: var(--brw-shadow);
    cursor: pointer;
    font: inherit;
    z-index: 2147483646;
  }
  .brw-svelte-fab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .brw-svelte-fab.brw-fab-br {
    right: 24px;
  }
  .brw-svelte-fab.brw-fab-bl {
    left: 24px;
  }

  .brw-svelte-panel {
    position: fixed;
    bottom: 88px;
    width: min(380px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 120px));
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

  /* Staged-status rows (#74). Visually mirrors the assistant bubble
     surface (background, padding, radius) but lives outside the bubble
     class family so it does not count as a conversation bubble for queries
     that count messages — the rows are progress indicators, not messages.
     The transition-delay / animation-delay are set inline per row so the
     three rows fade in sequentially even when the underlying SDK phase
     events fire microseconds apart. */
  .brw-svelte-status-row {
    align-self: flex-start;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 12px;
    border-bottom-left-radius: 4px;
    background: var(--brw-bubble-assistant-bg);
    color: var(--brw-fg);
    font-size: 13px;
    line-height: 1.45;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: brw-svelte-status-row-in 220ms ease-out both;
  }
  .brw-svelte-status-row-check {
    display: inline-flex;
    width: 14px;
    height: 14px;
    align-items: center;
    justify-content: center;
    color: var(--brw-accent);
  }
  .brw-svelte-status-row-label {
    flex: 1;
  }
  .brw-svelte-status-row--error {
    color: var(--brw-error);
    border: 1px solid var(--brw-error);
    background: var(--brw-bubble-assistant-bg);
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

  /* Outer composer is just the bottom strip — padding + bg + the
     divider line above. The actual input affordance lives in
     `.brw-svelte-composer-shell` so it reads as one unified chip
     containing the attach button, textarea, optional AI toggle and
     send button. Mirrors the React adapter's `.brw-composer` /
     `.brw-composer-shell` split (#114 follow-up — the original Svelte
     parity PR shipped a 3-row grid that put the textarea on its own
     row; this shape lines everything up on one row to match the
     React reference). */
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

  /* AI toggle — track-and-thumb switch, parity with the React adapter's
     iOS-style toggle (#65). The "AI" text sits outside the button so the
     switch itself is an unambiguous track, not a pressed-button state. */
  /* Wrap matches `.brw-svelte-send` height (34px) so the switch
     centre and the send-button centre land on the same baseline
     under the shell's `align-items: flex-end`. */
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
