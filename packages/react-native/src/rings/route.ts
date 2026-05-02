/**
 * Route ring — subscribes to React Navigation's `onStateChange` via the
 * `navigationRef` prop on `BrevwickProvider` and pushes
 * `{ path, timestamp }` entries that the core SDK's existing 20-entry
 * `RingBuffer<RouteEntry>` (`packages/sdk/src/core/client.ts` →
 * `createRingBuffer<RouteEntry>(20)`) caps via FIFO. Expo Router rides on
 * top of React Navigation, so the same hook serves both — see
 * `tatlacas-com/brevwick-sdk-js#87` and SDD § 12 `route_trail`.
 *
 * Mirrors Flutter's `BrevwickRouteObserver` (`brevwick-sdk-flutter/lib/src
 * /rings/route.dart`): two-step redaction so a tenant's named-placeholder
 * pattern (`:token`, `:auth`, `:key`, `:session`, `:sig`) is preserved as
 * `:<name>:[redacted]` for triage readability, while resolved param values
 * keyed by the same names are masked outright. The pattern set matches
 * `packages/sdk/src/rings/network.ts`'s `REDACT_QUERY_PARAM` so route +
 * network ring redaction stay in lockstep.
 *
 * No-op when `navigationRef` is null / has no `.current` / lacks
 * `addListener` — keeps consumers who don't pass the prop on the
 * "ring stays empty, no errors" path required by issue #87 acceptance.
 */

const REDACT_KEY = /^(token|auth|key|session|sig).*/i;

export interface RouteRingEntry {
  path: string;
  timestamp: number;
}

interface CurrentRoute {
  name: string;
  params?: Record<string, unknown>;
}

interface NavigationContainerRefLike {
  addListener(event: 'state', callback: (e?: unknown) => void): () => void;
  getCurrentRoute?(): CurrentRoute | undefined;
}

export interface NavigationRefLike {
  current: NavigationContainerRefLike | null;
}

/**
 * Subscribe `push` to React Navigation `state` events on the supplied
 * container ref. Returns an idempotent unsubscribe — safe to call from a
 * `useEffect` cleanup even when no real subscription was set up (missing
 * ref, missing `addListener`).
 */
export function attachRouteRing(
  navigationRef: NavigationRefLike | null | undefined,
  push: (entry: RouteRingEntry) => void,
): () => void {
  const ref = navigationRef?.current;
  if (!ref || typeof ref.addListener !== 'function') {
    return noop;
  }
  const unsubscribe = ref.addListener('state', () => {
    // Re-read `.current` per fire — the container ref is reassigned across
    // remounts, and capturing the initial ref would point at a stale
    // navigator after a hot reload or screen swap.
    const route = navigationRef?.current?.getCurrentRoute?.();
    if (!route || typeof route.name !== 'string') return;
    push({
      path: redactPathParams(route.name, route.params),
      timestamp: Date.now(),
    });
  });
  return typeof unsubscribe === 'function' ? unsubscribe : noop;
}

/**
 * Build the wire-level `path` string. Two passes:
 *
 * 1. Named-placeholder segments (`:token`, `:auth`, `:key`, `:session`,
 *    `:sig`) become `<segment>:[redacted]` so the *shape* of the route
 *    stays legible in triage even though the value is masked.
 * 2. Param keys matching the same pattern are emitted as `<key>=[redacted]`
 *    in the query suffix; non-sensitive keys keep their stringified value.
 *
 * Param-less routes serialise to just the (sanitised) name; this matches
 * the React Navigation `getCurrentRoute()` shape for paramless screens.
 */
export function redactPathParams(
  name: string,
  params?: Record<string, unknown>,
): string {
  const sanitisedName = name.includes(':')
    ? name
        .split('/')
        .map((seg) =>
          seg.startsWith(':') && REDACT_KEY.test(seg.slice(1))
            ? `${seg}:[redacted]`
            : seg,
        )
        .join('/')
    : name;
  if (!params) return sanitisedName;
  const keys = Object.keys(params);
  if (keys.length === 0) return sanitisedName;
  const parts: string[] = [];
  for (const k of keys) {
    if (REDACT_KEY.test(k)) {
      parts.push(`${k}=[redacted]`);
    } else {
      parts.push(`${k}=${stringifyParam(params[k])}`);
    }
  }
  return `${sanitisedName}?${parts.join('&')}`;
}

function stringifyParam(v: unknown): string {
  if (v == null) return '';
  const t = typeof v;
  if (t === 'string') return v as string;
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '[unserializable]';
  }
}

function noop(): void {}
