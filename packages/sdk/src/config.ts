/**
 * Project-config fetcher for `GET /v1/ingest/config`.
 *
 * Loaded lazily from `core/client.ts` so the eager bundle stays under the
 * 2.2 kB gzip budget (see `CLAUDE.md` + SDD § 12). Never throws — failure
 * modes all resolve to `null` so the widget degrades to "no toggle" without
 * bubbling errors through the caller.
 */
import type { ProjectConfig } from './types';
import { SDK_USER_AGENT } from './core/internal/sdk-version';

function isValid(body: unknown): body is ProjectConfig {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.ai_enabled === 'boolean' &&
    typeof b.ai_submitter_choice_allowed === 'boolean'
  );
}

export async function fetchConfig(
  endpoint: string,
  projectKey: string,
): Promise<ProjectConfig | null> {
  try {
    const res = await fetch(`${endpoint}/v1/ingest/config`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${projectKey}`,
        'X-Brevwick-SDK': SDK_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!isValid(body)) return null;
    return {
      ai_enabled: body.ai_enabled,
      ai_submitter_choice_allowed: body.ai_submitter_choice_allowed,
    };
  } catch {
    return null;
  }
}
