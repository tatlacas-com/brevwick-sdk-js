#!/usr/bin/env bash
# Rebuild + re-pack brevwick-sdk / brevwick-react and reinstall them into
# tradekit-web so a running `pnpm dev` picks up the latest SDK changes.
#
# This is a local-dev helper only. Both repos (brevwick-sdk-js and
# tradekit/tradekit-web) must be cloned side-by-side under ~/repos.
#
# Usage:  scripts/sync-to-tradekit-web.sh

set -euo pipefail

SDK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSUMER="${BREVWICK_CONSUMER:-/home/tatlacas/repos/tradekit/tradekit-web}"

if [[ ! -d "$CONSUMER" ]]; then
  echo "error: consumer dir not found: $CONSUMER" >&2
  echo "hint:  set BREVWICK_CONSUMER=/path/to/other/app to override" >&2
  exit 1
fi

echo "→ building packages"
pnpm --dir "$SDK_ROOT" --filter brevwick-sdk build
pnpm --dir "$SDK_ROOT" --filter brevwick-react build

echo "→ packing tarballs"
(cd "$SDK_ROOT/packages/sdk" && pnpm pack >/dev/null)
(cd "$SDK_ROOT/packages/react" && pnpm pack >/dev/null)

echo "→ reinstalling in $CONSUMER"
rm -rf "$CONSUMER/node_modules/brevwick-sdk" "$CONSUMER/node_modules/brevwick-react"
pnpm --dir "$CONSUMER" install --no-frozen-lockfile

echo "✓ synced. Restart the consumer's dev server to pick up the new bundle."
