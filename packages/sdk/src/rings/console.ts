import type { ConsoleEntry } from '../types';
import type { RingContext, RingDefinition } from '../core/internal';
import { redact } from '../core/internal/redact';

const DEDUPE_WINDOW_MS = 500;
const MAX_STACK_FRAMES = 20;

type PatchLevel = 'error' | 'warn';

/**
 * Coerce a single console arg to a string without JSON-stringifying Errors —
 * `JSON.stringify(err)` drops name/message/stack and yields `{}`. Objects are
 * JSON-stringified with a try/catch so circular refs can't blow up the ring.
 */
function safeStringify(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack
      ? `${arg.name}: ${arg.message}\n${arg.stack}`
      : `${arg.name}: ${arg.message}`;
  }
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  const t = typeof arg;
  if (t === 'string') return arg as string;
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(arg);
  if (t === 'function') {
    const name = (arg as { name?: string }).name;
    return `[function ${name || 'anonymous'}]`;
  }
  if (t === 'symbol') return (arg as symbol).toString();
  try {
    return JSON.stringify(arg) ?? '[unserializable]';
  } catch {
    return '[unserializable]';
  }
}

function joinArgs(args: readonly unknown[]): string {
  return args.map(safeStringify).join(' ');
}

function firstError(args: readonly unknown[]): Error | undefined {
  for (const a of args) {
    if (a instanceof Error) return a;
  }
  return undefined;
}

/**
 * Keep the first line (typically "Error: message") plus up to 20 frames.
 * V8-style stacks put the leader on line 0 and frames on lines 1..N, so
 * dropping lines past N+1 preserves the leader while capping frame count.
 */
function trimStack(stack: string): string {
  const lines = stack.split('\n');
  if (lines.length <= MAX_STACK_FRAMES) return stack;
  const leader = lines[0];
  const isFrameLeader = leader !== undefined && /^\s*at\s/.test(leader);
  if (isFrameLeader) {
    return lines.slice(0, MAX_STACK_FRAMES).join('\n');
  }
  return [leader ?? '', ...lines.slice(1, MAX_STACK_FRAMES + 1)].join('\n');
}

function firstFrame(stack: string | undefined): string {
  if (!stack) return '';
  const lines = stack.split('\n');
  for (const line of lines) {
    if (/^\s*at\s/.test(line)) return line.trim();
  }
  return '';
}

function dedupeKey(message: string, stack: string | undefined): string {
  return `${message}\u0001${firstFrame(stack)}`;
}

function buildEntry(
  level: PatchLevel,
  message: string,
  stack: string | undefined,
  now: number,
): ConsoleEntry {
  const entry: ConsoleEntry = {
    kind: 'console',
    level,
    message: redact(message),
    timestamp: now,
    count: 1,
  };
  if (stack) entry.stack = redact(trimStack(stack));
  return entry;
}

export function installConsoleRing(ctx: RingContext): () => void {
  const originalError = console.error;
  const originalWarn = console.warn;

  // Map key -> the *pushed* entry reference, so a repeat within the window
  // mutates `count` on the same object already sitting in the ring buffer.
  const recent = new Map<string, ConsoleEntry>();

  function record(
    level: PatchLevel,
    message: string,
    stack: string | undefined,
  ): void {
    const now = Date.now();
    const key = dedupeKey(message, stack);
    const last = recent.get(key);
    if (last && now - last.timestamp < DEDUPE_WINDOW_MS) {
      last.count = (last.count ?? 1) + 1;
      last.timestamp = now;
      return;
    }
    const entry = buildEntry(level, message, stack, now);
    recent.set(key, entry);
    ctx.push(entry);

    // Prune stale keys opportunistically so the map can't grow unbounded when
    // many distinct errors fire over time — anything older than the dedupe
    // window can never match again anyway.
    if (recent.size > 32) {
      for (const [k, v] of recent) {
        if (now - v.timestamp >= DEDUPE_WINDOW_MS) recent.delete(k);
      }
    }
  }

  function patched(level: PatchLevel, original: typeof console.error) {
    return function (this: unknown, ...args: unknown[]): void {
      try {
        const err = firstError(args);
        const message = joinArgs(args);
        record(level, message, err?.stack);
      } catch {
        // Capture must never break the caller's console.
      }
      original.apply(this, args);
    };
  }

  console.error = patched('error', originalError) as typeof console.error;
  console.warn = patched('warn', originalWarn) as typeof console.warn;

  const errorListener = (event: ErrorEvent): void => {
    const err = event.error;
    const message =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : typeof event.message === 'string' && event.message
          ? event.message
          : safeStringify(err);
    const stack = err instanceof Error ? err.stack : undefined;
    record('error', message, stack);
  };

  const rejectionListener = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : `Unhandled promise rejection: ${safeStringify(reason)}`;
    const stack = reason instanceof Error ? reason.stack : undefined;
    record('error', message, stack);
  };

  window.addEventListener('error', errorListener);
  window.addEventListener('unhandledrejection', rejectionListener);

  return function uninstall(): void {
    // Always restore the pre-install originals — any outer patch that
    // layered on top of ours will be broken either way, and leaving our
    // wrapper in place guarantees a memory leak plus a double-patch on
    // the next install cycle.
    console.error = originalError;
    console.warn = originalWarn;
    window.removeEventListener('error', errorListener);
    window.removeEventListener('unhandledrejection', rejectionListener);
    recent.clear();
  };
}

export const consoleRing: RingDefinition = {
  name: 'console',
  install: installConsoleRing,
};
