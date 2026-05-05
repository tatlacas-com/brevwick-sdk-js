<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    FeedbackAttachment,
    FeedbackInput,
    SubmitResult,
  } from '@tatlacas/brevwick-sdk';
  import { getFeedback, type FeedbackStatus } from '../context';
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
  // surface). Enforced in the UI so the user can't queue an attachment the
  // SDK would reject downstream.
  const MAX_ATTACHMENTS = 5;

  // Resolved during component init so getContext() finds the parent layout's
  // setBrevwickContext call — Svelte requires getContext to run on the
  // initialisation call stack, not from inside onMount.
  const feedback = getFeedback();
  const status = feedback.status;

  let mounted = false;
  let open = false;
  let draft = '';
  let files: { id: number; file: File }[] = [];
  let submitError: string | null = null;
  let successAt: number | null = null;
  let fileId = 0;

  $: attachmentsAtCap = files.length >= MAX_ATTACHMENTS;
  $: canSend = draft.trim().length > 0 && $status !== 'submitting';

  onMount(() => {
    mounted = true;
    return () => {
      // Defence-in-depth: ensure the Escape keydown listener is detached
      // even if the component unmounts while the panel is still open.
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleWindowKeydown);
      }
    };
  });

  function toggleOpen(): void {
    if (disabled) return;
    open = !open;
    if (open) {
      successAt = null;
      submitError = null;
    }
  }

  function closePanel(): void {
    open = false;
  }

  // Escape-to-close: parity with the React adapter (Radix Dialog ships this
  // for free). Listener is attached only while the panel is open and is
  // detached the moment it closes or the component unmounts.
  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closePanel();
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
      if (file) next.push({ id: ++fileId, file });
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

    const derivedTitle = (draft.trim().split('\n', 1)[0] ?? '').slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description: draft,
      attachments: attachments.length ? attachments : undefined,
    };

    const submittedFileIds = new Set(files.map((f) => f.id));
    try {
      const result = await feedback.submit(input);
      onSubmit?.(result);
      if (result.ok) {
        successAt = Date.now();
        draft = '';
        files = files.filter((f) => !submittedFileIds.has(f.id));
      } else {
        submitError = result.error.message;
      }
    } catch (err) {
      submitError =
        err instanceof Error && err.message
          ? err.message
          : 'We could not submit your feedback. Please try again.';
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

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Reactive so the FAB / panel CSS classes re-derive when `position` changes.
  $: fabPosClass = position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  $: panelPosClass =
    position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';
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
            aria-label="Close"
            on:click={closePanel}
          >
            ×
          </button>
        </header>

        <div class="brw-svelte-thread" role="log" aria-live="polite">
          <div class="brw-svelte-bubble brw-svelte-bubble--assistant">
            Hi! Tell us what's happening.
          </div>

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

          {#if submitError}
            <div class="brw-svelte-error" role="alert">{submitError}</div>
          {/if}

          {#if $status === 'submitting'}
            <div class="brw-svelte-bubble brw-svelte-bubble--assistant">
              Sending…
            </div>
          {/if}

          {#if successAt !== null}
            <div
              class="brw-svelte-bubble brw-svelte-bubble--assistant brw-svelte-bubble--receipt"
              role="status"
            >
              Thanks — your issue is on its way.
            </div>
          {/if}
        </div>

        <div class="brw-svelte-composer">
          <label class="brw-svelte-icon-btn" aria-label="Attach file">
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
            class="brw-svelte-textarea"
            rows={2}
            placeholder="Describe the bug or feedback…"
            bind:value={draft}
            on:keydown={handleKeydown}
            aria-label="Feedback message"
            disabled={$status === 'submitting'}
          ></textarea>
          <button
            type="button"
            class="brw-svelte-send"
            aria-label="Send"
            on:click={handleSubmit}
            disabled={!canSend}
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
              <path d="M4 20l16-8L4 4l2 8-2 8z" />
              <path d="M6 12h14" />
            </svg>
          </button>
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
    --brw-chip-bg: #f3f4f6;
    --brw-composer-bg: #ffffff;
    --brw-border: #e5e7eb;
    --brw-border-focus: #818cf8;
    --brw-divider: #e5e7eb;
    --brw-accent: #4f46e5;
    --brw-accent-fg: #ffffff;
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
  }
  .brw-svelte-bubble--assistant {
    background: var(--brw-bubble-assistant-bg);
    align-self: flex-start;
  }
  .brw-svelte-bubble--receipt {
    color: var(--brw-fg-muted);
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
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }

  .brw-svelte-composer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: end;
    padding: 10px 12px;
    background: var(--brw-composer-bg);
    border-top: 1px solid var(--brw-divider);
  }
  .brw-svelte-textarea {
    grid-column: 1 / -1;
    width: 100%;
    border: 1px solid var(--brw-border);
    border-radius: 10px;
    padding: 8px 10px;
    background: var(--brw-bg);
    color: var(--brw-fg);
    resize: none;
    font: inherit;
    box-sizing: border-box;
  }
  .brw-svelte-textarea:focus {
    outline: none;
    border-color: var(--brw-border-focus);
  }
  .brw-svelte-send {
    appearance: none;
    border: none;
    background: var(--brw-accent);
    color: var(--brw-accent-fg);
    width: 36px;
    height: 36px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
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
