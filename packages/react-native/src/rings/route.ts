/**
 * Route ring — subscribes to React Navigation's `onStateChange` via the
 * `navigationRef` prop on `BrevwickProvider` and pushes
 * `{ kind: 'route', path, timestamp }` entries that the core SDK's
 * 20-entry `RingBuffer<RouteEntry>` (`packages/sdk/src/core/client.ts` →
 * `createRingBuffer<RouteEntry>(20)`) caps via FIFO. Expo Router rides on
 * top of React Navigation, so the same hook serves both — see
 * `tatlacas-com/brevwick-sdk-js#87` and SDD § 12 `route_trail`.
 *
 * Mirrors the Flutter SDK's `BrevwickRouteObserver` three-stage redaction:
 *
 * 1. Named-placeholder segments matching {@link SENSITIVE_PARAM_KEYS}
 *    (`:token`, `:auth`, `:key`, `:session`, `:sig`) become
 *    `:<name>:[redacted]` so the *shape* of the route stays legible in
 *    triage even though the value is masked.
 * 2. Param keys matching the same pattern are emitted as
 *    `<key>=[redacted]` in the query suffix.
 * 3. Every benign-keyed param value is run through the SDK's global
 *    `redact()` BEFORE `encodeURIComponent`, so a JWT / email / IP /
 *    PAN / Bearer token carried by a benign-named key is masked even
 *    when the key itself was not flagged. This is the "every payload
 *    that leaves the device runs through `redact()` first" rule from
 *    CLAUDE.md. Order matters: percent-encoding before redacting would
 *    silently leak — `user@example.com` → `user%40example.com` no
 *    longer matches the email regex.
 *
 * Both the regex set and the redactor are imported from
 * `@tatlacas/brevwick-sdk` so the route + network rings stay in lockstep
 * — duplicating either would let "what counts as sensitive" drift across
 * the two surfaces.
 *
 * No-op when `navigationRef` is null / has no `.current` / lacks
 * `addListener` — keeps consumers who don't pass the prop on the
 * "ring stays empty, no errors" path required by issue #87 acceptance.
 *
 * NavigationContainerRef shape authored against `@react-navigation/native`
 * v6.x and v7.x; both versions expose the same `addListener('state', cb)`
 * + `getCurrentRoute()` slice. Bumps to React Navigation that change the
 * listener signature should update {@link NavigationContainerRefLike}.
 */

import { redact, SENSITIVE_PARAM_KEYS } from '@tatlacas/brevwick-sdk';
import type { RouteEntry } from '@tatlacas/brevwick-sdk';

interface CurrentRoute {
  name: string;
  params?: Record<string, unknown>;
}

/**
 * Structural slice of `NavigationContainerRef` we exercise. Avoids a hard
 * dep on `@react-navigation/native` so the package can ship as a pure peer
 * dependency. The event payload is deliberately discarded as `unknown` —
 * we only need the firing signal, not `event.data.state`.
 */
export interface NavigationContainerRefLike {
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
 * ref, missing `addListener`) and safe to call more than once.
 *
 * Per-fire reads use the captured `ref` (not `navigationRef.current`) so
 * the listener and the `getCurrentRoute()` read always come from the same
 * navigator instance. `useNavigationContainerRef()` returns a stable ref,
 * so re-reading `.current` per fire would have introduced a split-brain
 * bug across hot reloads (listener attached to old container, route read
 * from new container). Re-attachment across remounts is the provider's
 * responsibility — keyed `useEffect` on `navigationRef.current` lands
 * with #83.
 *
 * Calling `attachRouteRing` twice on the same `navigationRef` attaches
 * two listeners — the provider only ever calls once per mount, so this
 * is a documented contract limitation rather than a real-world bug.
 */
export function attachRouteRing(
  navigationRef: NavigationRefLike | null | undefined,
  push: (entry: RouteEntry) => void,
): () => void {
  const ref = navigationRef?.current;
  if (!ref || typeof ref.addListener !== 'function') {
    return noop;
  }
  const unsubscribe = ref.addListener('state', () => {
    // Re-read via the captured `ref` — not `navigationRef.current` —
    // so subscribe + read always target the same navigator instance.
    const route = ref.getCurrentRoute?.();
    if (!route || typeof route.name !== 'string') return;
    push({
      kind: 'route',
      path: redactPathParams(route.name, route.params),
      timestamp: Date.now(),
    });
  });
  // React Navigation's `addListener` always returns a function, but we
  // guard defensively against off-spec stubs (and against the lazy /
  // not-yet-mounted state some shims model with `undefined`). Without the
  // guard, calling the unsubscribe in cleanup would crash the provider.
  const detach = typeof unsubscribe === 'function' ? unsubscribe : noop;
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    detach();
  };
}

/**
 * Build the wire-level `path` string. Two passes:
 *
 * 1. Named-placeholder segments matching {@link SENSITIVE_PARAM_KEYS}
 *    (`:token`, `:auth`, `:key`, `:session`, `:sig`) become
 *    `<segment>:[redacted]` so the *shape* of the route stays legible in
 *    triage even though the value is masked.
 * 2. Param keys matching the same pattern are emitted as
 *    `<key>=[redacted]` in the query suffix; non-sensitive keys keep
 *    their stringified value.
 *
 * Param keys are sorted alphabetically so the same logical route always
 * serialises to the same `path` string regardless of param-construction
 * order — this lets triagers grep `path` reliably across runs.
 *
 * `name`, keys, and values are URL-encoded via `encodeURIComponent` so
 * a route name like `Search?` or a param value containing `&` / `=` /
 * `#` / `%` cannot collide with the `?` / `&` / `=` separators we emit.
 * This mirrors how the network ring serialises URLs via
 * `URL.searchParams.toString()`.
 *
 * Param-less routes serialise to just the (encoded) name; this matches
 * the React Navigation `getCurrentRoute()` shape for paramless screens.
 *
 * NOTE: this function is internal to the package — `attachRouteRing` is
 * the only intended caller. It is not part of the public API surface.
 */
export function redactPathParams(
  name: string,
  params?: Record<string, unknown>,
): string {
  const sanitisedName = name
    .split('/')
    .map((seg) =>
      seg.startsWith(':') && SENSITIVE_PARAM_KEYS.test(seg.slice(1))
        ? `${encodeURIComponent(seg)}:[redacted]`
        : encodeURIComponent(seg),
    )
    .join('/');
  if (!params) return sanitisedName;
  const keys = Object.keys(params).sort();
  if (keys.length === 0) return sanitisedName;
  const parts: string[] = [];
  for (const k of keys) {
    const encodedKey = encodeURIComponent(k);
    if (SENSITIVE_PARAM_KEYS.test(k)) {
      parts.push(`${encodedKey}=[redacted]`);
    } else {
      // `redact()` runs on the raw stringified value BEFORE
      // `encodeURIComponent` because the redactor's patterns match the
      // raw shapes (`user@example.com`, `eyJabc.def.ghi`, `10.0.42.55`)
      // — once the value is percent-encoded, the literal `@` becomes
      // `%40` and the email pattern no longer matches. Order matters:
      // encode-then-redact silently leaks; redact-then-encode masks.
      const redactedValue = redact(stringifyParam(params[k]));
      parts.push(`${encodedKey}=${encodeURIComponent(redactedValue)}`);
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
    // `JSON.stringify(undefined)` (and `JSON.stringify(() => {})`) returns
    // `undefined`, not a string. Fall back to the unserialisable marker so
    // a key whose value cannot be serialised is unambiguous in triage —
    // distinct from `key=` which means `value: ''`.
    const json = JSON.stringify(v);
    return json ?? '[unserializable]';
  } catch {
    return '[unserializable]';
  }
}

function noop(): void {}
