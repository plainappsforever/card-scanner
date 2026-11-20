#!/usr/bin/env bash
# Run Maestro flows against the build already installed on the simulator/emulator.
# Usage: scripts/e2e.sh <ios|android> [development|preview|production] [flow.yaml ...]
# With no flows, runs every top-level flow in .maestro/.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

platform=${1:?Usage: e2e.sh <ios|android> [variant] [flows...]}
variant=${2:-development}
shift $(($# >= 2 ? 2 : 1))
flows=("$@")
[[ ${#flows[@]} -gt 0 ]] || flows=(.maestro)

app_id=$(APP_VARIANT=$variant npx expo config --json --type public | node -e \
  'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).ios.bundleIdentifier)')

# curl is blocked on this Mac: check Metro with node's fetch.
if [[ $variant == development ]] && ! node -e 'fetch("http://localhost:"+process.argv[1]+"/status").then((r) => r.text()).then((t) => process.exit(t.includes("running") ? 0 : 1)).catch(() => process.exit(1))' "$METRO_PORT"; then
  echo "Metro is not running. Start it with: npm run dev (port $METRO_PORT)" >&2
  exit 1
fi

device=$(scripts/boot.sh "$platform")
if [[ $platform == android ]]; then
  # Test hygiene (P8): contacts-denied.yaml answers "Don't allow"; a second denial leaves Contacts "don't ask again"
  # (USER_FIXED) and later bulk flows never see the prompt. Clear THIS app's Contacts flags only (Maestro's launch
  # with permissions unset revokes the grant itself). iOS resets on launch.
  for perm in READ_CONTACTS WRITE_CONTACTS; do
    adb -s "$device" shell pm clear-permission-flags "$app_id" "android.permission.$perm" user-set user-fixed >/dev/null 2>&1 || true
  done
fi
out="artifacts/maestro/$platform-$variant-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
echo "Maestro: $app_id on $platform ($device) -> $out"
extra=()
for kv in ${MAESTRO_ENV:-}; do extra+=(-e "$kv"); done
maestro --device "$device" test -e APP_ID="$app_id" ${extra[@]+"${extra[@]}"} --test-output-dir "$out" "${flows[@]}"
