'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useBrevwickInternal } from './context';
import { useFeedback, type FeedbackPhase } from './use-feedback';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from './styles';

declare const __BREVWICK_REACT_VERSION__: string;

/**
 * Stable snapshot of one attachment that rode along with a submit. We store
 * only the underlying `Blob` (not the live `ScreenshotAttachment.url`),
 * because the success path revokes the composer's object URL the moment the
 * snapshot is appended — keeping the URL on the message would leave a
 * dangling reference. A future render that wants to preview the attachment
 * can call `URL.createObjectURL(blob)` itself.
 */
interface MessageAttachment {
  blob: Blob;
  filename?: string;
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
   * only when the host enabled `config.debug` (the SDK returns it on
   * `SubmitResult.debug.payload`). When present, the bubble renders a
   * "copy raw payload" affordance so a developer can inspect everything that
   * left the device, including the rings/context the widget never shows.
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

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! Tell us what's happening. A screenshot helps if you have one.",
};

const initialMessages = (): Message[] => [GREETING_MESSAGE];

const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';

/**
 * Forced-palette choice for {@link FeedbackButton}. `'system'` defers to the
 * OS-level `prefers-color-scheme` media query (the default and pre-existing
 * behaviour); `'light'` / `'dark'` override it regardless of the OS setting.
 */
export type BrevwickTheme = 'light' | 'dark' | 'system';

/**
 * Props for {@link FeedbackButton}. See SDD § 12 for the React contract.
 */
export interface FeedbackButtonProps {
  /** Corner the FAB pins to. Default `'bottom-right'`. */
  position?: 'bottom-right' | 'bottom-left';
  /** When true, the FAB renders as disabled and cannot open the dialog. */
  disabled?: boolean;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** Additional class appended to the FAB and dialog root for styling overrides. */
  className?: string;
  /** FAB label. Default `'Feedback'`. */
  label?: ReactNode;
  /**
   * Force a palette regardless of the OS `prefers-color-scheme` setting.
   * Default `'system'` — the widget follows the OS.
   *
   * Host-level `:root { --brw-*: ... }` overrides still win over the
   * forced palette because the stylesheet consumes each public token
   * via `var(--brw-X, var(--brw-X-base))`: the forced-theme blocks
   * rewrite only `--brw-X-base`, never the public `--brw-X`. So
   * `theme="dark"` picks the base palette and a consumer-set
   * `--brw-accent: hotpink` still wins for the accent.
   */
  theme?: BrevwickTheme;
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  onSubmit?: (result: SubmitResult) => void;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Injects the bundled <style> tag on first mount. The DOM probe by id is
 * the single source of truth: React does not dedupe `<style>` by id, so the
 * guard prevents duplicates when multiple <FeedbackButton>s mount, and it is
 * robust under Fast Refresh / HMR (which would otherwise read a stale
 * module-level flag against a teardown'd style node).
 */
/**
 * Read `prefers-reduced-motion: reduce` once at mount. The widget keys row
 * stagger off this so a user with the OS-level reduced-motion setting sees
 * all status rows mount at once instead of cascading in.
 *
 * Read at mount only — the spec is an at-render snapshot, and a user that
 * toggles the OS setting mid-submit will pick up the new value on the
 * next interaction (or panel open). SSR-safe: returns `false` when
 * `window.matchMedia` is unavailable.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduced;
}

function useBrevwickStyles(): void {
  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(BREVWICK_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = BREVWICK_STYLE_ID;
    el.textContent = BREVWICK_CSS;
    document.head.appendChild(el);
  }, []);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectConfigState {
  status: ProjectConfigStatus;
  config: ProjectConfig | null;
}

/**
 * Lazy project-config fetch, triggered on the FIRST panel open for the
 * lifetime of this FeedbackButton. Subsequent opens reuse the in-memory
 * result — the core SDK also caches per session, so the second call would
 * be a no-op anyway, but tracking here avoids an extra awaited microtask
 * on every open.
 *
 * Explicitly does NOT fetch on mount — the widget's "zero-cost until
 * opened" property must hold for users who never engage the FAB.
 */
function useProjectConfig(open: boolean): ProjectConfigState {
  const { brevwick } = useBrevwickInternal();
  const triggeredRef = useRef(false);
  const [state, setState] = useState<ProjectConfigState>({
    status: 'idle',
    config: null,
  });

  useEffect(() => {
    if (!open) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    let cancelled = false;
    setState({ status: 'loading', config: null });
    brevwick
      .getConfig()
      .then((config) => {
        if (cancelled) return;
        setState({ status: 'ready', config });
      })
      .catch(() => {
        if (cancelled) return;
        // getConfig never rejects in the documented contract, but we stay
        // defensive so a future regression cannot wedge the widget in
        // 'loading' forever.
        setState({ status: 'error', config: null });
      });

    return () => {
      cancelled = true;
    };
  }, [brevwick, open]);

  return state;
}

/**
 * Monotonic id attached to each uploaded file at insert time. Using `name` or
 * the index as the React key would cause duplicate-named files or removals
 * of middle items to reconcile surviving chips against the wrong slots.
 */
interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

/**
 * Brevwick feedback widget — a FAB plus a dialog-based submission form.
 *
 * ## Theming
 *
 * The widget exposes a set of CSS custom properties (`--brw-*`) that any
 * ancestor can override to re-theme without a rebuild. Light defaults ship
 * out of the box; a `@media (prefers-color-scheme: dark)` block swaps the
 * palette when the host OS is in dark mode. The {@link FeedbackButtonProps.theme}
 * prop can force `'light'` or `'dark'` regardless of the OS setting.
 *
 * Set these as CSS custom properties on any ancestor (e.g. `:root` or your
 * app shell) to re-theme the widget without a rebuild. Every widget rule
 * reads each token via `var(--brw-X, var(--brw-X-base))`, so a host
 * override of the public `--brw-X` name always wins — even under a forced
 * `theme="light|dark"` (which rewrites the internal `-base` defaults, not
 * the public names).
 *
 * Surfaces
 * - `--brw-panel-bg` — dialog panel background
 * - `--brw-bubble-assistant-bg` — assistant bubble background
 * - `--brw-bubble-user-bg` — user bubble background
 * - `--brw-bubble-user-fg` — foreground on top of `--brw-bubble-user-bg`
 *   (set as a pair with `--brw-bubble-user-bg` to keep bubble contrast
 *   WCAG-adequate)
 * - `--brw-chip-bg` — attachment chip + inline panel background
 * - `--brw-composer-bg` — composer shell background
 *
 * Text
 * - `--brw-fg` — primary foreground text
 * - `--brw-fg-muted` — muted / secondary text
 *
 * Border / focus
 * - `--brw-border` — default border colour
 * - `--brw-border-focus` — colour applied on composer `:focus-within`
 * - `--brw-divider` — hairline between panel header / composer and thread
 *
 * Accent
 * - `--brw-accent` — send button + active AI toggle colour
 * - `--brw-accent-fg` — foreground on top of accent (set as a pair
 *   with `--brw-accent` so accent + accent-fg stay contrast-safe; e.g.
 *   a bright `--brw-accent` must pair with a dark `--brw-accent-fg`)
 *
 * Shadow
 * - `--brw-shadow` — composite drop shadow for FAB + panel
 *
 * @see SDD § 12 for the React contract.
 */
export function FeedbackButton({
  position = 'bottom-right',
  disabled = false,
  hidden = false,
  className,
  label = 'Feedback',
  theme = 'system',
  onSubmit,
}: FeedbackButtonProps): ReactElement | null {
  const {
    submit,
    captureScreenshot,
    status,
    phase,
    error: submitErrorTagged,
    reset,
  } = useFeedback();
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [screenshots, setScreenshots] = useState<
    readonly ScreenshotAttachment[]
  >([]);
  const [files, setFiles] = useState<readonly FileAttachment[]>([]);
  const [capturing, setCapturing] = useState(false);
  // Stable screenshot id of the thumbnail the user tapped to preview;
  // `null` keeps the preview dialog closed. Using the id (not the array
  // index) means the dialog stays bound to the same attachment if the
  // user removes a sibling screenshot mid-preview — the lookup
  // `screenshots.find(s => s.id === previewId)` returns `null` only when
  // the previewed screenshot itself was removed, which is the case
  // `removeScreenshot()` handles by clearing `previewId`.
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [regionOpen, setRegionOpen] = useState(false);
  // Submitter's per-issue AI preference. Defaults to true so the toggle
  // renders "on" the first time; only read on submit when the render-policy
  // matrix below says the toggle should be visible.
  const [useAi, setUseAi] = useState(true);
  const mountedRef = useRef(true);
  // Mirrors `screenshots[*].url` for the unmount cleanup so we don't have to
  // close over a stale `screenshots` value in the cleanup function.
  const screenshotUrlsRef = useRef<readonly string[]>([]);
  // Mirror of `files.length`. The cap check inside `performCapture`'s
  // `setScreenshots` updater needs the **current** file count, not the
  // closure-captured one — files attached *during* a long-running capture
  // would otherwise be invisible to the defence-in-depth guard, letting
  // the cap silently slip from 5 to 6.
  const filesLengthRef = useRef(0);
  const screenshotIdRef = useRef(0);
  const fileIdRef = useRef(0);
  const messageIdRef = useRef(0);
  // Snapshot of the last `FeedbackInput` passed to `submit()` so the
  // retry CTA on a failed submit can re-run with the exact same payload
  // (including any captured screenshots) without forcing the user to
  // re-type the draft we cleared synchronously on Send.
  const lastSubmittedInputRef = useRef<FeedbackInput | null>(null);
  // Id of the user bubble for the most recent submit, so the retry path can
  // re-attach a freshly composed `rawPayload` to the same bubble (retry
  // recomposes the payload from current ring snapshots).
  const lastUserMessageIdRef = useRef<string | null>(null);

  useBrevwickStyles();

  const projectConfig = useProjectConfig(open);
  // Render-policy matrix, SDD § 12. The toggle is visible exactly when the
  // config has loaded successfully, AI is enabled for the project, AND the
  // admin has opted submitters into the choice. Any other state (loading,
  // error, disabled, admin-forced) hides the toggle and the payload omits
  // `use_ai` so the server-side default applies.
  const showAiToggle =
    projectConfig.status === 'ready' &&
    projectConfig.config?.ai_enabled === true &&
    projectConfig.config.ai_submitter_choice_allowed === true;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const url of screenshotUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      screenshotUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    screenshotUrlsRef.current = screenshots.map((s) => s.url);
  }, [screenshots]);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files]);

  const attachmentCount = screenshots.length + files.length;
  const attachmentsAtCap = attachmentCount >= MAX_ATTACHMENTS;

  const hasContent =
    draft.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    screenshots.length > 0 ||
    files.length > 0;

  const resetAll = useCallback(() => {
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setScreenshots((prev) => {
      for (const s of prev) URL.revokeObjectURL(s.url);
      return [];
    });
    setFiles([]);
    setPreviewId(null);
    setConfirmClose(false);
    setSubmitError(null);
    setMessages(initialMessages());
    setUseAi(true);
    lastSubmittedInputRef.current = null;
    reset();
  }, [reset]);

  const handleFullClose = useCallback(() => {
    setOpen(false);
    resetAll();
  }, [resetAll]);

  const handleMinimize = useCallback(() => {
    setOpen(false);
    setConfirmClose(false);
    setSubmitError(null);
  }, []);

  // Radix routes Esc, overlay clicks, and parent setOpen through onOpenChange.
  // Map a programmatic close-to-false to 'minimize' semantics so Esc preserves
  // the user's draft. The × button handles the dirty-confirm flow directly.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
        return;
      }
      handleMinimize();
    },
    [handleMinimize],
  );

  const handleCloseClick = useCallback(() => {
    if (hasContent) {
      setConfirmClose(true);
      return;
    }
    handleFullClose();
  }, [hasContent, handleFullClose]);

  // Split from the historical one-shot capture: the button now only opens
  // the region overlay, and the overlay fans out to either a full-page or
  // a cropped capture. `setRegionOpen(false)` schedules the overlay unmount
  // and we start `captureScreenshot()` in the same tick — so the primary
  // protection against the overlay bleeding into the rendered page is
  // `data-brevwick-skip` on every overlay node, which the SDK's capture
  // path honours before it snapshots. The React unmount lands before the
  // async rasterization / crop work completes and is defence-in-depth.
  //
  // `capturing` is the in-thread loading flag (issue #55). The region
  // overlay closes the moment the user clicks Capture so the panel is
  // already visible by the time `captureScreenshot()` resolves; the flag
  // surfaces a "Capturing screenshot…" bubble in the thread to bridge that
  // gap so the panel re-appearing without the chip is no longer mysterious.
  const performCapture = useCallback(
    async (region: Region | null) => {
      setSubmitError(null);
      setCapturing(true);
      try {
        const blob = await captureScreenshot();
        if (!mountedRef.current) return;
        // The SDK bounds `captureScreenshot()` with its own hard deadline,
        // but the crop stage (image decode + canvas encode) runs OUTSIDE
        // that envelope. An image decode that never settles would leave
        // `capturing` true forever — permanently disabling Send and the
        // Enter-to-send path, i.e. blocking feedback submission outright —
        // so the crop gets the same deadline treatment. On timeout the
        // rejection flows through the catch below: error surfaced,
        // `capturing` cleared in `finally`.
        const finalBlob = region
          ? await withCropDeadline(cropToRegion(blob, region), CROP_TIMEOUT_MS)
          : blob;
        if (!mountedRef.current) return;
        let rejectedAtCap = false;
        setScreenshots((prev) => {
          // Defence-in-depth: the screenshot button is disabled at the cap,
          // but a long-running capture started before files were attached
          // can still land after the combined total is at the ceiling.
          // Read the file count from the ref (not the closure) so we see
          // anything attached while the capture was in flight. Drop the
          // new capture rather than silently exceed the SDK's combined
          // attachment ceiling. (Object URL is created inside the branch
          // that keeps the capture so a rejected one doesn't leak.) The
          // user-visible message is set after the setState below so the
          // updater stays pure.
          if (prev.length + filesLengthRef.current >= MAX_ATTACHMENTS) {
            rejectedAtCap = true;
            return prev;
          }
          return [
            ...prev,
            {
              id: ++screenshotIdRef.current,
              blob: finalBlob,
              url: URL.createObjectURL(finalBlob),
            },
          ];
        });
        if (rejectedAtCap) {
          setSubmitError(`Maximum ${MAX_ATTACHMENTS} attachments reached`);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Screenshot capture failed';
        setSubmitError(message);
      } finally {
        if (mountedRef.current) setCapturing(false);
      }
    },
    [captureScreenshot],
  );

  const handleOpenRegionOverlay = useCallback(() => {
    setSubmitError(null);
    setRegionOpen(true);
  }, []);

  const handleCloseRegion = useCallback(() => {
    setRegionOpen(false);
  }, []);

  const handleConfirmRegion = useCallback(
    (region: Region) => {
      setRegionOpen(false);
      void performCapture(region);
    },
    [performCapture],
  );

  const handleConfirmFull = useCallback(() => {
    setRegionOpen(false);
    void performCapture(null);
  }, [performCapture]);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      setFiles((prev) => {
        // Cap the combined screenshot+file total at MAX_ATTACHMENTS so a
        // bulk-add via <input multiple> can't exceed the SDK ceiling. Keep
        // prefix-of-input semantics: drop the overflow tail rather than
        // silently dropping arbitrary entries.
        const remaining = MAX_ATTACHMENTS - (prev.length + screenshots.length);
        if (remaining <= 0) return prev;
        const next = Array.from(list)
          .slice(0, remaining)
          .map<FileAttachment>((file) => ({
            id: ++fileIdRef.current,
            file,
          }));
        return [...prev, ...next];
      });
    },
    [screenshots.length],
  );

  const removeScreenshot = useCallback((id: number) => {
    setScreenshots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
    setPreviewId((current) => (current === id ? null : current));
  }, []);

  const handlePreviewScreenshot = useCallback((id: number) => {
    setPreviewId(id);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewId(null);
  }, []);

  const removeFile = useCallback((id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * Stamp the dev-only raw payload onto a user bubble once `submit()`
   * resolves. No-op unless the host enabled `config.debug` (the SDK only
   * populates `result.debug` then), so this is inert in production.
   */
  const attachRawPayload = useCallback(
    (messageId: string, result: SubmitResult) => {
      const payload = result.debug?.payload;
      if (!payload) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, rawPayload: payload } : m,
        ),
      );
    },
    [],
  );

  const doSubmit = useCallback(async () => {
    if (status === 'submitting') return;
    // Block submission while a capture is in flight. Without this, the user
    // could press Enter in the composer between clicking Capture and the
    // thumbnail rendering, sending the issue without the screenshot they
    // intended to include. The Send button itself is disabled in this
    // state, but the Enter-to-send shortcut bypasses the button so the
    // guard belongs here on the submit path too.
    if (capturing) return;
    if (!draft.trim()) {
      setSubmitError('Please describe what happened.');
      return;
    }
    setSubmitError(null);

    const attachments: Array<Blob | FeedbackAttachment> = [];
    // Single-screenshot filename stays `screenshot.<ext>` (matches pre-#56
    // wire format and keeps existing tests / server-side identifiers
    // stable). Multi-screenshot submissions disambiguate with `-1`, `-2`,
    // … using the array order they were captured in.
    screenshots.forEach((s, idx) => {
      const ext = s.blob.type.split('/')[1]?.split('+')[0] || 'webp';
      const filename =
        screenshots.length === 1
          ? `screenshot.${ext}`
          : `screenshot-${idx + 1}.${ext}`;
      attachments.push({ blob: s.blob, filename });
    });
    for (const { file } of files)
      attachments.push({ blob: file, filename: file.name });

    // Submit what the user actually sees in their bubble — trimming here
    // would drop the user's intentional whitespace/newlines on the wire.
    // `draft.trim().length > 0` above already rejects the whitespace-only
    // case; for title derivation we still want the first non-empty line.
    const derivedTitle = draft.trim().split('\n', 1)[0]!.slice(0, 120);
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
    // animation while the network round-trip is in flight (issue #74).
    const submittedDraft = draft;
    const screenshotsSnapshot: readonly MessageAttachment[] | undefined =
      screenshots.length > 0
        ? screenshots.map((s) => ({ blob: s.blob }))
        : undefined;
    const filesSnapshot: readonly MessageAttachment[] | undefined =
      files.length > 0
        ? files.map(({ file }) => ({
            blob: file,
            filename: file.name,
          }))
        : undefined;
    const userMessage: Message = {
      id: `msg-${++messageIdRef.current}`,
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
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    // The success path keeps the screenshot blobs already captured in
    // userMessage.attachments so the bubble keeps a stable reference even
    // after we drop the live attachment URLs from the composer.
    setScreenshots((prev) => {
      for (const s of prev) URL.revokeObjectURL(s.url);
      return [];
    });
    setFiles([]);
    setPreviewId(null);
    lastSubmittedInputRef.current = input;
    lastUserMessageIdRef.current = userMessage.id;

    try {
      const result = await submit(input);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      attachRawPayload(userMessage.id, result);
      if (result.ok) {
        const assistantMessage: Message = {
          id: `msg-${++messageIdRef.current}`,
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        // If the user minimized mid-submit, pop the panel back open so the
        // success confirmation is actually seen. A silent success while
        // hidden leaves the user unsure whether their issue landed.
        setOpen(true);
      } else {
        // Failure: the user bubble is already in the thread; the staged
        // rows collapse into a red retry row driven by `phase === 'error'`
        // (see `Thread` below). Pop the panel back open so the user
        // actually sees the retry CTA.
        setOpen(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // Chunk-load failure path — the hook has already flipped phase to
      // `'error'` and stored a synthetic SubmitError. Just pop the panel
      // back open so the retry row is visible.
      void err;
      setOpen(true);
    }
  }, [
    actual,
    attachRawPayload,
    capturing,
    draft,
    expected,
    files,
    onSubmit,
    screenshots,
    showAiToggle,
    status,
    submit,
    useAi,
  ]);

  /**
   * Re-run the most recent submit with the original `FeedbackInput`. The
   * user bubble is already in the thread (pushed on the first Send),
   * so the retry path only needs to re-fire `submit()` and append the
   * assistant receipt on success — no duplicate bubble for the retry.
   */
  const doRetry = useCallback(async () => {
    const last = lastSubmittedInputRef.current;
    if (!last) return;
    if (status === 'submitting') return;
    try {
      const result = await submit(last);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      const retriedId = lastUserMessageIdRef.current;
      if (retriedId) attachRawPayload(retriedId, result);
      if (result.ok) {
        const assistantMessage: Message = {
          id: `msg-${++messageIdRef.current}`,
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setOpen(true);
      } else {
        setOpen(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      void err;
      setOpen(true);
    }
  }, [attachRawPayload, onSubmit, status, submit]);

  if (hidden) return null;

  const fabPosClass = position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const panelPosClass =
    position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';
  const rootClassName = ['brw-root', className].filter(Boolean).join(' ');

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-brevwick-skip=""
          data-brw-theme={theme}
          className={`${rootClassName} brw-fab ${fabPosClass}`}
          disabled={disabled}
          aria-label="Open feedback form"
        >
          <ChatIcon />
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          data-brevwick-skip=""
          data-brw-theme={theme}
          // Hide the panel while the region overlay is up so the user can see
          // (and select a region over) page content the panel would otherwise
          // cover. The panel stays mounted — visibility:hidden preserves
          // composer state, focus is owned by the overlay's nested Dialog,
          // and the existing `data-brevwick-skip` keeps it out of the
          // captured image.
          className={`${rootClassName} brw-panel ${panelPosClass}${regionOpen ? ' brw-panel-hidden' : ''}`}
          aria-describedby={undefined}
        >
          <PanelHeader
            submitting={status === 'submitting'}
            onMinimize={handleMinimize}
            onClose={handleCloseClick}
          />
          <Thread
            messages={messages}
            screenshots={screenshots}
            files={files}
            capturing={capturing}
            showExtras={showExtras}
            expected={expected}
            actual={actual}
            confirmClose={confirmClose}
            submitError={submitError}
            phase={phase}
            submitErrorTagged={submitErrorTagged}
            aiEnabled={projectConfig.config?.ai_enabled === true}
            reducedMotion={reducedMotion}
            onRetry={() => {
              void doRetry();
            }}
            onToggleExtras={() => setShowExtras((v) => !v)}
            onExpectedChange={setExpected}
            onActualChange={setActual}
            onRemoveScreenshot={removeScreenshot}
            onPreviewScreenshot={handlePreviewScreenshot}
            onRemoveFile={removeFile}
            onConfirmDiscard={handleFullClose}
            onCancelClose={() => setConfirmClose(false)}
          />
          <Composer
            draft={draft}
            submitting={status === 'submitting'}
            capturing={capturing}
            attachmentsAtCap={attachmentsAtCap}
            showAiToggle={showAiToggle}
            useAi={useAi}
            onDraftChange={setDraft}
            onSubmit={doSubmit}
            onAttachScreenshot={handleOpenRegionOverlay}
            onAttachFiles={handleFiles}
            onUseAiChange={setUseAi}
          />
          <PanelFooter />
        </Dialog.Content>
      </Dialog.Portal>
      <RegionCaptureOverlay
        open={regionOpen}
        theme={theme}
        onClose={handleCloseRegion}
        onConfirmRegion={handleConfirmRegion}
        onConfirmFull={handleConfirmFull}
      />
      <ScreenshotPreviewDialog
        open={previewId !== null}
        screenshot={
          previewId !== null
            ? (screenshots.find((s) => s.id === previewId) ?? null)
            : null
        }
        theme={theme}
        onClose={handleClosePreview}
      />
    </Dialog.Root>
  );
}

interface PanelHeaderProps {
  submitting: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

function PanelHeader({
  submitting,
  onMinimize,
  onClose,
}: PanelHeaderProps): ReactElement {
  return (
    <div className="brw-panel-header">
      <span className="brw-panel-avatar" aria-hidden="true">
        B
      </span>
      <Dialog.Title className="brw-panel-title">Send feedback</Dialog.Title>
      <button
        type="button"
        className="brw-icon-btn"
        aria-label="Minimize"
        onClick={onMinimize}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="brw-icon-btn"
        aria-label="Close"
        onClick={onClose}
        /* Disable close while a submit is in flight — clicking "Discard"
           mid-request would otherwise throw the confirmation away while the
           callback still resolves into the parent. */
        disabled={submitting}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Thin "Brevwick v<x.y.z>" credit anchored below the composer. The whole
 * label is a single link to brevwick.dev so the footer reads as one
 * affordance rather than two competing elements; styling keeps it muted
 * and small so it sits quietly at the bottom of the panel.
 */
function PanelFooter(): ReactElement {
  return (
    <div className="brw-panel-footer">
      <a
        className="brw-panel-footer-link"
        href="https://brevwick.dev"
        target="_blank"
        rel="noopener noreferrer"
      >
        Brevwick v{__BREVWICK_REACT_VERSION__}
      </a>
    </div>
  );
}

interface ThreadProps {
  messages: readonly Message[];
  screenshots: readonly ScreenshotAttachment[];
  files: readonly FileAttachment[];
  capturing: boolean;
  showExtras: boolean;
  expected: string;
  actual: string;
  confirmClose: boolean;
  submitError: string | null;
  phase: FeedbackPhase;
  submitErrorTagged: SubmitError | null;
  aiEnabled: boolean;
  reducedMotion: boolean;
  onRetry: () => void;
  onToggleExtras: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
  onRemoveScreenshot: (id: number) => void;
  onPreviewScreenshot: (id: number) => void;
  onRemoveFile: (id: number) => void;
  onConfirmDiscard: () => void;
  onCancelClose: () => void;
}

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
 * when the underlying SDK phase events fire microseconds apart on a
 * healthy happy path. Honoured only when the user has not requested
 * reduced motion — see {@link usePrefersReducedMotion}.
 */
const STATUS_ROW_STAGGER_MS = 200;

function Thread({
  messages,
  screenshots,
  files,
  capturing,
  showExtras,
  expected,
  actual,
  confirmClose,
  submitError,
  phase,
  submitErrorTagged,
  aiEnabled,
  reducedMotion,
  onRetry,
  onToggleExtras,
  onExpectedChange,
  onActualChange,
  onRemoveScreenshot,
  onPreviewScreenshot,
  onRemoveFile,
  onConfirmDiscard,
  onCancelClose,
}: ThreadProps): ReactElement {
  const phaseRank = PHASE_RANK[phase];
  const showCaptured = phaseRank >= PHASE_RANK.sanitising;
  const showSanitised = phaseRank >= PHASE_RANK.formatting;
  // Row 3 is gated on the project's AI configuration AND the exact
  // 'formatting' phase — it disappears the moment the pipeline reports
  // 'sent' so the user is not left with a perpetually spinning row.
  const showFormatting = phase === 'formatting' && aiEnabled;
  const showRetryRow = phase === 'error' && submitErrorTagged !== null;

  return (
    <div
      className="brw-thread"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {messages.map((message) =>
        message.role === 'assistant' ? (
          <AssistantBubble
            key={message.id}
            issueSent={message.issueSent}
            sentAt={message.sentAt}
          >
            {message.text}
          </AssistantBubble>
        ) : (
          <UserBubble key={message.id} rawPayload={message.rawPayload}>
            {message.text}
          </UserBubble>
        ),
      )}
      {screenshots.map((s, idx) => {
        const label =
          screenshots.length === 1 ? 'screenshot' : `screenshot ${idx + 1}`;
        return (
          <AttachmentChip
            key={s.id}
            name={label}
            size={s.blob.size}
            previewUrl={s.url}
            onPreview={() => onPreviewScreenshot(s.id)}
            onRemove={() => onRemoveScreenshot(s.id)}
          />
        );
      })}
      {files.map(({ id, file }) => (
        <AttachmentChip
          key={id}
          name={file.name}
          size={file.size}
          onRemove={() => onRemoveFile(id)}
        />
      ))}
      {/* In-thread loading indicator (issue #55). The region overlay closes
          before `captureScreenshot()` resolves, so the panel is already
          visible when this bubble shows up — it bridges the otherwise-silent
          gap between the overlay closing and the thumbnail appearing. */}
      {capturing && (
        <AssistantBubble>
          <span className="brw-spinner" aria-hidden="true" /> Capturing
          screenshot…
        </AssistantBubble>
      )}
      <DisclosureExpectedActual
        open={showExtras}
        expected={expected}
        actual={actual}
        onToggle={onToggleExtras}
        onExpectedChange={onExpectedChange}
        onActualChange={onActualChange}
      />
      {/* Validation / capture errors set by feedback-button itself stay on
          the existing inline alert. Submit-pipeline failures are rendered
          by the retry row below so the user gets the proper retry CTA. */}
      {submitError && (
        <div className="brw-error" role="alert">
          {submitError}
        </div>
      )}
      {(showCaptured || showSanitised || showFormatting) && (
        <div className="brw-status-rows">
          {showCaptured && (
            <StatusRow
              variant="check"
              // Row 1 anchors the cascade at 0 ms; rows 2 and 3 stagger off it.
              delayMs={0}
              dataRow="captured"
            >
              Captured route, console, network, device
            </StatusRow>
          )}
          {showSanitised && (
            <StatusRow
              variant="check"
              delayMs={reducedMotion ? 0 : STATUS_ROW_STAGGER_MS}
              dataRow="sanitised"
            >
              PII-sanitised, packaged
            </StatusRow>
          )}
          {showFormatting && (
            <StatusRow
              variant="spinner"
              delayMs={reducedMotion ? 0 : STATUS_ROW_STAGGER_MS * 2}
              dataRow="formatting"
            >
              Formatting with AI…
            </StatusRow>
          )}
        </div>
      )}
      {showRetryRow && submitErrorTagged && (
        <RetryRow error={submitErrorTagged} onRetry={onRetry} />
      )}
      {confirmClose && (
        <DiscardConfirm onCancel={onCancelClose} onConfirm={onConfirmDiscard} />
      )}
    </div>
  );
}

interface StatusRowProps {
  variant: 'check' | 'spinner';
  delayMs: number;
  dataRow: string;
  children: ReactNode;
}

/**
 * One staged-status row in the conversation thread. Visual variants:
 *
 * - `'check'` — green checkmark + label. Used for the "Captured" /
 *   "Sanitised" milestones.
 * - `'spinner'` — spinner + label. Used for the "Formatting with AI…"
 *   row that sits next to the pending AI work.
 *
 * The `data-brw-row` attribute exists for the test suite to query rows by
 * their role-in-the-pipeline without coupling to the visible label.
 * Stagger is applied as an `animation-delay` so the rows fade in
 * sequentially under the shared entrance keyframe.
 */
function StatusRow({
  variant,
  delayMs,
  dataRow,
  children,
}: StatusRowProps): ReactElement {
  return (
    <div
      className="brw-status-row"
      style={{ animationDelay: `${delayMs}ms` }}
      data-brw-row={dataRow}
    >
      {variant === 'check' ? (
        <span className="brw-status-row-check" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : (
        <span className="brw-spinner" aria-hidden="true" />
      )}
      <span className="brw-status-row-label">{children}</span>
    </div>
  );
}

interface RetryRowProps {
  error: SubmitError;
  onRetry: () => void;
}

/**
 * Red retry row shown when the submit pipeline fails. Renders the
 * `SubmitError.message` verbatim — server-echoed bodies have already
 * been redacted upstream — and a single "Retry" CTA wired to
 * {@link UseFeedbackResult.retry}.
 *
 * `role="alert"` so screen readers pick up the failure inside the
 * panel's `aria-live="polite"` thread; `data-brw-error-code` keeps the
 * code accessible to the test suite without coupling on the rendered
 * copy.
 */
function RetryRow({ error, onRetry }: RetryRowProps): ReactElement {
  // The error message is a direct text child of the role="alert" element
  // so testing-library `getByText(..., { selector: '[role="alert"]' })`
  // matches it without recursing through wrapper spans. The Retry button
  // sits beside the message.
  return (
    <div
      className="brw-status-row brw-status-row--error"
      role="alert"
      data-brw-error-code={error.code}
      data-brw-row="error"
    >
      {error.message}
      <button
        type="button"
        className="brw-btn brw-status-row-retry"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}

interface DiscardConfirmProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline `role="alert"` confirm — not a true modal dialog. Focus moves to
 * "Keep" on appearance so a keyboard user can dismiss with Enter without
 * having to Tab through the surrounding chrome; "Keep" is the non-destructive
 * default so an accidental Enter preserves the draft.
 */
function DiscardConfirm({
  onCancel,
  onConfirm,
}: DiscardConfirmProps): ReactElement {
  const keepRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return (
    <div className="brw-confirm" role="alert" aria-label="Discard draft?">
      <span className="brw-confirm-msg">Discard your feedback?</span>
      <button
        ref={keepRef}
        type="button"
        className="brw-btn"
        onClick={onCancel}
      >
        Keep
      </button>
      <button
        type="button"
        className="brw-btn brw-btn-primary"
        onClick={onConfirm}
      >
        Discard
      </button>
    </div>
  );
}

interface AssistantBubbleProps {
  children: ReactNode;
  issueSent?: boolean;
  sentAt?: number;
}

function AssistantBubble({
  children,
  issueSent,
  sentAt,
}: AssistantBubbleProps): ReactElement {
  return (
    <div className="brw-bubble brw-bubble--assistant">
      {children}
      {issueSent && (
        <div className="brw-bubble--receipt">
          <CheckIcon /> Issue sent · {formatRelativeTime(sentAt)}
        </div>
      )}
    </div>
  );
}

function UserBubble({
  children,
  rawPayload,
}: {
  children: ReactNode;
  rawPayload?: Record<string, unknown>;
}): ReactElement {
  return (
    <div className="brw-bubble brw-bubble--user">
      {children}
      {rawPayload !== undefined && <CopyRawButton payload={rawPayload} />}
    </div>
  );
}

/**
 * Dev-only affordance rendered on a sent bubble when the SDK returned a
 * `debug.payload` (i.e. the host set `config.debug`). Copies the exact,
 * post-redaction JSON body that was POSTed to the ingest endpoint —
 * including the console / network / route rings and device + user context
 * the widget never shows — so a developer can inspect everything that left
 * the device. Pretty-printed with a two-space indent for readability; the
 * parsed JSON matches what was sent over the wire (only the whitespace
 * differs from the unindented request body).
 */
function CopyRawButton({
  payload,
}: {
  payload: Record<string, unknown>;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const json = JSON.stringify(payload, null, 2);
    const clip = navigator.clipboard;
    // Degrade to a no-op on insecure contexts / older browsers where the
    // async clipboard API is missing, rather than throwing inside the dialog.
    if (!clip) return;
    void clip.writeText(json).then(
      () => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard write rejected (permissions) — leave the label unchanged */
      },
    );
  }, [payload]);

  return (
    <button
      type="button"
      className="brw-copy-raw"
      onClick={handleCopy}
      aria-label="Copy the raw payload sent to the API"
      data-brw-copy-raw=""
    >
      {copied ? 'Copied!' : 'Copy raw payload'}
    </button>
  );
}

/**
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * doesn't auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters
 * (the user reads it within seconds of seeing it appear). Intentionally
 * does not pull in `Intl.RelativeTimeFormat` or `date-fns` so the
 * react-bundle gzip stays inside the §12 budget.
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

interface AttachmentChipProps {
  name: string;
  size: number;
  previewUrl?: string;
  /** When provided alongside `previewUrl`, the thumbnail becomes a button
   *  that opens the screenshot preview dialog. File chips (no `previewUrl`)
   *  never receive this — they are not previewable. */
  onPreview?: () => void;
  onRemove: () => void;
}

function AttachmentChip({
  name,
  size,
  previewUrl,
  onPreview,
  onRemove,
}: AttachmentChipProps): ReactElement {
  // Render the thumbnail as a button only when there's something to preview
  // and a handler to call. The keyboard activation comes free with `<button>`,
  // so screen-reader users can hit Enter / Space to open the preview the
  // same way pointer users can click. The remove × is a sibling — clicks on
  // it don't propagate into the thumbnail's open-preview path because they
  // are different elements.
  return (
    <div className="brw-chip">
      {previewUrl &&
        (onPreview ? (
          <button
            type="button"
            className="brw-chip-preview-btn"
            aria-label={`Preview ${name}`}
            onClick={onPreview}
          >
            <img src={previewUrl} alt="" />
          </button>
        ) : (
          <img src={previewUrl} alt="" />
        ))}
      <span className="brw-chip-name">{name}</span>
      <span className="brw-chip-size">{formatSize(size)}</span>
      <button
        type="button"
        className="brw-chip-remove"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

interface DisclosureProps {
  open: boolean;
  expected: string;
  actual: string;
  onToggle: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
}

function DisclosureExpectedActual({
  open,
  expected,
  actual,
  onToggle,
  onExpectedChange,
  onActualChange,
}: DisclosureProps): ReactElement {
  // Per-instance id so rendering multiple <FeedbackButton>s (or two panels
  // mid-animation) doesn't collide on a shared DOM id and break aria-controls.
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className="brw-disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {open ? 'Hide expected vs actual' : 'Add expected vs actual'}
      </button>
      {open && (
        <div id={panelId} className="brw-disclosure-panel">
          <label>
            <span className="brw-disclosure-label">Expected</span>
            <textarea
              className="brw-disclosure-input"
              rows={2}
              value={expected}
              onChange={(e) => onExpectedChange(e.target.value)}
            />
          </label>
          <label>
            <span className="brw-disclosure-label">Actual</span>
            <textarea
              className="brw-disclosure-input"
              rows={2}
              value={actual}
              onChange={(e) => onActualChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </>
  );
}

interface ComposerProps {
  draft: string;
  submitting: boolean;
  /** True while a screenshot is being rasterised/cropped (issue #55). The
   *  composer disables the screenshot + file-attach buttons so the user
   *  cannot stack a second capture on top of one already in flight. */
  capturing: boolean;
  /** True once `screenshots.length + files.length >= MAX_ATTACHMENTS` (#56).
   *  Disables the screenshot + file-attach buttons with an explanatory
   *  aria-label so the user can't queue an attachment the SDK would reject. */
  attachmentsAtCap: boolean;
  showAiToggle: boolean;
  useAi: boolean;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onAttachScreenshot: () => void;
  onAttachFiles: (list: FileList | null) => void;
  onUseAiChange: (v: boolean) => void;
}

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    {
      draft,
      submitting,
      capturing,
      attachmentsAtCap,
      showAiToggle,
      useAi,
      onDraftChange,
      onSubmit,
      onAttachScreenshot,
      onAttachFiles,
      onUseAiChange,
    },
    forwardedRef,
  ): ReactElement {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(forwardedRef, () => textareaRef.current!, []);

    // Autogrow between ~1 and ~5 rows. The CSS `max-height` on the input
    // bounds this visually; the JS mirror keeps the height animating up as
    // the user types. Both come from the same COMPOSER_MAX_HEIGHT_PX
    // constant so bumping the ceiling is a single edit.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
    }, [draft]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        onSubmit();
      }
    };

    // Once a capture is in flight or the attachment cap is reached, the
    // screenshot + file-attach controls are disabled. The aria-label on the
    // screenshot button mutates so AT users hear *why* the control is
    // unavailable instead of the generic "Capture screenshot of this page,
    // dimmed" announcement.
    const attachDisabled = submitting || capturing || attachmentsAtCap;
    const screenshotLabel = attachmentsAtCap
      ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
      : capturing
        ? 'Capturing screenshot…'
        : 'Capture screenshot of this page';
    const fileLabel = attachmentsAtCap
      ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
      : 'Attach file';
    return (
      <div className="brw-composer">
        <div className="brw-composer-shell">
          <button
            type="button"
            className="brw-icon-btn"
            aria-label={screenshotLabel}
            onClick={onAttachScreenshot}
            disabled={attachDisabled}
          >
            <ScreenshotIcon />
          </button>
          <label className="brw-icon-btn">
            <PaperclipIcon />
            <input
              type="file"
              multiple
              aria-label={fileLabel}
              className="brw-file-input"
              onChange={(e) => {
                onAttachFiles(e.target.files);
                e.target.value = '';
              }}
              disabled={attachDisabled}
            />
          </label>
          <textarea
            ref={textareaRef}
            className="brw-composer-input"
            rows={1}
            placeholder="Describe the bug or feedback…"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Feedback message"
          />
          {showAiToggle && (
            <AIToggle
              on={useAi}
              disabled={submitting}
              onChange={onUseAiChange}
            />
          )}
          <button
            type="button"
            className="brw-send-btn"
            aria-label="Send"
            disabled={submitting || capturing || draft.trim().length === 0}
            onClick={onSubmit}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    );
  },
);

interface AIToggleProps {
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Track-and-thumb switch surfaced in the composer footer when the project
 * allows submitters to opt in/out of AI formatting per issue. The "AI" text
 * sits outside the button so the switch itself is an unambiguous iOS-style
 * track — visually obvious that it toggles, not a pressed-button state.
 *
 * role="switch" + aria-checked is the narrow semantic the WCAG a11y matrix
 * wants. Space toggles when focused (default browser behaviour on
 * role="button" is Enter and Space, but Space carries fewer collisions with
 * the composer's Enter-to-send shortcut).
 */
function AIToggle({ on, disabled, onChange }: AIToggleProps): ReactElement {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === ' ') {
      e.preventDefault();
      onChange(!on);
    }
  };
  return (
    <span className="brw-aitoggle-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Format with AI"
        className={`brw-aitoggle${on ? ' brw-aitoggle--on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
        onKeyDown={handleKeyDown}
      >
        <span className="brw-aitoggle-thumb" aria-hidden="true" />
      </button>
      <span className="brw-aitoggle-text" aria-hidden="true">
        AI
      </span>
    </span>
  );
}

/**
 * Hard deadline on the crop stage, mirroring the SDK's capture deadline
 * (same 10 s figure — both stages process the same page-sized bitmap).
 * `loadImageForCrop` resolves on the image's load/error events; a decode
 * that fires neither (browser bug, wedged worker, hostile test env) must
 * reject through `performCapture`'s normal failure path instead of leaving
 * the returned promise pending forever.
 */
const CROP_TIMEOUT_MS = 10_000;

function withCropDeadline(work: Promise<Blob>, ms: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Screenshot crop exceeded the ${ms}ms deadline`));
    }, ms);
    // Handlers attach to `work` up-front, so a late settle after the
    // deadline fired lands in an already-settled promise — never an
    // unhandled rejection.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Crop a full-page screenshot Blob to the user-selected viewport rectangle.
 *
 * The source Blob from `captureScreenshot()` is rendered in device pixels by
 * `modern-screenshot`, but the region came from pointer-events in CSS pixels,
 * so we multiply the source rectangle by `devicePixelRatio` on the way in and
 * draw out at the selection's CSS-pixel size. Uses `OffscreenCanvas` when the
 * host provides it (cheaper, avoids a DOM node); otherwise falls back to a
 * detached `<canvas>` + `toBlob`. Output MIME is PNG — the caller derives
 * the attachment filename from `blob.type`.
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
      typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : undefined;
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

interface DragState {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface RegionCaptureOverlayProps {
  open: boolean;
  theme: BrevwickTheme;
  onClose: () => void;
  onConfirmRegion: (region: Region) => void;
  onConfirmFull: () => void;
}

/**
 * Full-viewport overlay that lets the submitter drag-select a rectangle on
 * top of the page. Confirming with a non-degenerate rectangle fans out to
 * the crop pipeline; 'Capture full page' preserves the pre-#31 behaviour
 * for users who want the whole viewport.
 *
 * Mounts a second `Dialog.Root` independent of the main feedback panel so
 * Radix owns focus trap + scroll lock + Escape-to-dismiss. Every node
 * rendered here carries `data-brevwick-skip=""` so a rogue capture that
 * fires while the overlay is still in the tree still excludes the overlay
 * chrome from the image (the capture path unmounts the overlay first — this
 * is defence-in-depth).
 */
function RegionCaptureOverlay({
  open,
  theme,
  onClose,
  onConfirmRegion,
  onConfirmFull,
}: RegionCaptureOverlayProps): ReactElement {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shake, setShake] = useState(false);
  const draggingRef = useRef(false);
  // Tracks the in-flight "shake settle" setTimeout. We keep the handle so
  // (a) the effect below can cancel it when the overlay closes — otherwise
  // a shake queued immediately before Esc would fire a setState on an
  // unmounted subtree (strict-mode warning) — and (b) rapid-fire Capture
  // clicks on a degenerate selection replace the timer instead of stacking.
  const shakeTimerRef = useRef<number | null>(null);

  const clearShakeTimer = (): void => {
    if (shakeTimerRef.current !== null) {
      window.clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
  };

  // Reset both the drag state and the transient shake flag whenever the
  // overlay closes, so a re-open starts from a clean slate rather than the
  // last session's selection. Also cancels any in-flight shake timer so
  // the setState does not fire into a torn-down subtree.
  useEffect(() => {
    if (!open) {
      setDrag(null);
      setShake(false);
      draggingRef.current = false;
      clearShakeTimer();
    }
  }, [open]);

  // Belt-and-braces unmount cleanup: the overlay normally closes via
  // `open=false` before unmount (handled above), but an upstream tree
  // tear-down could unmount us mid-shake — cancel the timer so React
  // doesn't log a "state update on unmounted component" warning.
  useEffect(() => {
    return () => {
      clearShakeTimer();
    };
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    // React delegation bubbles pointerdown from the Cancel / Capture /
    // Capture-full-page controls up through this handler. Without this
    // guard the bubbled event would reinitialise the drag state to a
    // zero-size rect right before the button's own click fires, sending
    // a valid selection into the degenerate-shake path. `currentTarget`
    // is always the overlay layer; only initiate a drag when the press
    // landed directly on it (not on a descendant control).
    if (e.target !== e.currentTarget) return;
    // Ignore non-primary buttons (right-click / middle-click). pointerType
    // 'touch' and 'pen' always issue button === 0.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      w: 0,
      h: 0,
    });
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    setDrag((prev) => {
      if (!prev) return prev;
      const x = Math.min(prev.startX, e.clientX);
      const y = Math.min(prev.startY, e.clientY);
      const w = Math.abs(e.clientX - prev.startX);
      const h = Math.abs(e.clientY - prev.startY);
      return { startX: prev.startX, startY: prev.startY, x, y, w, h };
    });
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    draggingRef.current = false;
  };

  const confirm = (): void => {
    if (!drag || drag.w <= REGION_MIN_SIDE_PX || drag.h <= REGION_MIN_SIDE_PX) {
      setShake(true);
      // Replace any in-flight settle timer so rapid-fire clicks don't stack.
      clearShakeTimer();
      shakeTimerRef.current = window.setTimeout(() => {
        shakeTimerRef.current = null;
        setShake(false);
      }, 320);
      return;
    }
    onConfirmRegion({ x: drag.x, y: drag.y, w: drag.w, h: drag.h });
  };

  // Enter-on-Dialog.Content must only confirm the region when the overlay
  // root itself has focus. Tab-focusing a button inside the overlay and
  // pressing Enter bubbles up here; without this guard we would hijack the
  // button's own Enter activation (Cancel, Capture full page) and run the
  // region-confirm path instead — a real a11y defect. `e.target === e.currentTarget`
  // restricts the shortcut to the overlay root (focused via Radix focus-trap
  // when the Dialog opens and no button is yet tabbed into).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    confirm();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="brw-region-backdrop" data-brevwick-skip="" />
        <Dialog.Content
          className={`brw-root brw-region-layer${shake ? ' brw-region-shake' : ''}`}
          data-brevwick-skip=""
          data-brw-theme={theme}
          data-testid="brw-region-overlay"
          aria-label="Select screenshot region"
          aria-describedby={undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {/* Radix requires a Dialog.Title descendant; using the same text
             here as the intended label keeps the screen-reader announcement
             as "Select screenshot region". */}
          <Dialog.Title className="brw-sr-only">
            Select screenshot region
          </Dialog.Title>
          {drag && drag.w > 0 && drag.h > 0 && (
            <div
              className="brw-region-selection"
              data-testid="brw-region-selection"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.w,
                height: drag.h,
              }}
            />
          )}
          <div className="brw-region-controls" data-brevwick-skip="">
            <button
              type="button"
              className="brw-btn brw-region-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="brw-btn brw-region-btn"
              onClick={onConfirmFull}
            >
              Capture full page
            </button>
            <button
              type="button"
              className="brw-btn brw-btn-primary brw-region-btn"
              onClick={confirm}
            >
              Capture
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ScreenshotPreviewDialogProps {
  open: boolean;
  /**
   * The screenshot the dialog should preview. Lifted into a prop (rather
   * than a `src` string) so the dialog can format its sr-only title from
   * the same blob metadata the chip uses, keeping the preview-button
   * `aria-label="Preview <name>"` and the dialog title in sync.
   *
   * `null` while the dialog is closed; the `open` prop is the source of
   * truth for visibility, but Radix mounts the portal regardless so we
   * defer rendering the `<img>` until a screenshot is actually selected.
   */
  screenshot: ScreenshotAttachment | null;
  theme: BrevwickTheme;
  onClose: () => void;
}

/**
 * Modal dialog that shows the captured screenshot at viewport-fit size so
 * the submitter can confirm they captured the right region before sending.
 * Mounted as a sibling Dialog.Root to the panel — same pattern as
 * `RegionCaptureOverlay` — so Radix owns Esc-to-dismiss, focus trap, and
 * focus-restore back to the chip's preview button when the dialog closes.
 *
 * Carries `data-brevwick-skip=""` on every node so a re-capture initiated
 * while the dialog is up doesn't snapshot the dialog chrome itself.
 */
function ScreenshotPreviewDialog({
  open,
  screenshot,
  theme,
  onClose,
}: ScreenshotPreviewDialogProps): ReactElement {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="brw-preview-backdrop"
          data-brevwick-skip=""
        />
        <Dialog.Content
          className="brw-root brw-preview-layer"
          data-brevwick-skip=""
          data-brw-theme={theme}
          data-testid="brw-preview-dialog"
          aria-label="Screenshot preview"
          aria-describedby={undefined}
        >
          <Dialog.Title className="brw-sr-only">
            Screenshot preview
          </Dialog.Title>
          {screenshot && (
            <img
              className="brw-preview-image"
              src={screenshot.url}
              alt="Captured screenshot"
            />
          )}
          <button
            type="button"
            className="brw-icon-btn brw-preview-close"
            aria-label="Close preview"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChatIcon(): ReactElement {
  return (
    <svg
      className="brw-fab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function MinimizeIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 14h14" />
    </svg>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ScreenshotIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <rect x="7" y="8" width="10" height="6" rx="1" strokeDasharray="2 2" />
    </svg>
  );
}

function PaperclipIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}

function SendIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l16-8L4 4l2 8-2 8z" />
      <path d="M6 12h14" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
