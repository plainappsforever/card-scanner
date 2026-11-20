#!/usr/bin/env bash
# App Store screenshots (RELEASE_KIT 3e): cards list, review, card, export, my card - in English, then in German - captured by
# Maestro (.maestro/screenshots/*.yaml) on the PRODUCTION Release build installed on a 6.9-inch simulator, with a clean status bar
# (9:41, full battery and signal), light mode. Ported from loyalty-cards/scripts/screenshots.sh (iOS only).
# Usage: scripts/screenshots.sh            (production is the only variant: no banner, no debug element)
#   Build first:  IOS_SIMULATOR="Cardkeep Shots iPhone" IOS_RUNTIME=27.0 IOS_DEVICE_TYPE="iPhone 17 Pro Max" scripts/native.sh ios production
#   The simulator is SCREENSHOT_IOS_SIM (default "Cardkeep Shots iPhone", an iPhone 17 Pro Max = 1320 x 2868, created by boot.sh).
#   A production build has no seed route (D49): .maestro/screenshots/seed.yaml types the demo library in through the real UI
#   (fresh install, event, five pasted cards, one card from a photo, "My card"); every person and company in it is invented.
#   The photo is assets/dev-seed/b1-uk-01.jpg (Hallworth Pryce, no such firm in the UK register; override with PHOTO=...), added to the simulator's photo library. The camera does not exist on the
#   simulator: the scan screen is not shown, the photo-import path stands in for it (kit 3e does not list a scan screen).
# Output: artifacts/screenshots/ios/{en,de}/0N-<name>.png - the folders scripts/asc-submit.py `shots` reads (overwritten on the next run).
# Nothing leaves the Mac. The status-bar override is removed again at the end; the app language is set back to the phone's.
set -euo pipefail
cd "$(dirname "$0")/.."
export IOS_SIMULATOR="${SCREENSHOT_IOS_SIM:-Cardkeep Shots iPhone}"
export IOS_RUNTIME="${SCREENSHOT_IOS_RUNTIME:-27.0}"
export IOS_DEVICE_TYPE="${IOS_DEVICE_TYPE:-iPhone 17 Pro Max}"
source scripts/env.sh

variant=production
config=$(APP_VARIANT=$variant npx expo config --json --type public)
app_id=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).ios.bundleIdentifier)' <<<"$config")
scheme=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).scheme)' <<<"$config")
dest="artifacts/screenshots/ios"
run="artifacts/maestro/ios-$variant-screenshots-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dest/en" "$dest/de" "$run"

device=$(scripts/boot.sh ios)
# The newest Release simulator build whose bundle id is the production one (the generated project keeps its first name).
app=""
for cand in $(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/*/Build/Products/Release-iphonesimulator/*.app 2>/dev/null); do
  id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$cand/Info.plist" 2>/dev/null || true)
  if [[ $id == "$app_id" && -f $cand/main.jsbundle ]]; then app=$cand; break; fi
done
[[ -n $app ]] || { echo "No Release simulator build of $app_id found. Run: scripts/native.sh ios $variant" >&2; exit 1; }
echo "Installing $app on $IOS_SIMULATOR ($device)"
xcrun simctl ui "$device" appearance light
xcrun simctl terminate "$device" "$app_id" >/dev/null 2>&1 || true
xcrun simctl install "$device" "$app"
# A second addmedia of the same file hung for 17 minutes (2026-11-06): SKIP_ADDMEDIA=1 when the card photo is already in the library.
[[ ${SKIP_ADDMEDIA:-0} == 1 ]] || xcrun simctl addmedia "$device" "${PHOTO:-assets/dev-seed/b1-uk-01.jpg}"
xcrun simctl status_bar "$device" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100
cleanup() { xcrun simctl status_bar "$device" clear >/dev/null 2>&1 || true; }
trap cleanup EXIT

status=0
mt() { maestro --device "$device" test -e APP_ID="$app_id" -e SCHEME="$scheme" --test-output-dir "$run" "$@" || status=$?; }
mt .maestro/screenshots/seed.yaml
mt -e SHOTS=en .maestro/screenshots/listing.yaml
mt -e LANG_ID=de .maestro/screenshots/language.yaml
mt -e SHOTS=de .maestro/screenshots/listing.yaml
mt -e LANG_ID=system .maestro/screenshots/language.yaml

# Maestro 2.x files each takeScreenshot under <output>/<run>/<flow>/takeScreenshot/.
count=0
for lang in en de; do
  for name in 01-cards 02-review 03-card 04-export 05-my-card; do
    shot=$(find "$run" -name "$lang-$name.png" | head -1)
    if [[ -z $shot ]]; then
      echo "MISSING: $lang-$name" >&2
      status=1
      continue
    fi
    cp "$shot" "$dest/$lang/$name.png"
    count=$((count + 1))
  done
done
echo "Screenshots: $count of 10 in $dest (Maestro run: $run)"
for f in "$dest"/en/0*.png "$dest"/de/0*.png; do [[ -f $f ]] && sips -g pixelWidth -g pixelHeight -g hasAlpha "$f" | awk -v f="$f" '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} /hasAlpha/ {a=$2} END {print "  " f ": " w " x " h " alpha=" a}'; done
exit "$status"
