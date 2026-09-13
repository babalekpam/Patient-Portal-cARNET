#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."
test_files=()
for file in artifacts/mobile/tests/*.test.ts; do
  # The adapter needs test-only native aliases; bundle it separately below.
  [[ "$file" == *"/navimedi.adapter.test.ts" ]] || test_files+=("$file")
done
bun test "${test_files[@]}"

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
pnpm dlx esbuild@0.28.2 artifacts/mobile/tests/navimedi.adapter.test.ts \
  --bundle --platform=node --format=esm \
  --outfile="$test_dir/navimedi.adapter.test.mjs" \
  --tsconfig=artifacts/mobile/tsconfig.json \
  --alias:react-native=./artifacts/mobile/tests/stubs/react-native.ts \
  '--alias:@/lib/session=./artifacts/mobile/tests/stubs/session.ts'
node --test "$test_dir/navimedi.adapter.test.mjs"