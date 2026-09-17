#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."
test_files=()
for file in artifacts/mobile/tests/*.test.ts; do
  # Native imports need test-only aliases; bundle the NaviMED config and
  # adapter suites separately below instead of loading react-native directly
  # through Bun.
  [[ "$file" == *"/navimedi.adapter.test.ts" ]] ||
    [[ "$file" == *"/navimedi.config.test.ts" ]] ||
    [[ "$file" == *"/production-api.test.ts" ]] ||
    test_files+=("$file")
done
bun test "${test_files[@]}"

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
for test_name in navimedi.config navimedi.adapter; do
  pnpm dlx esbuild@0.28.2 "artifacts/mobile/tests/${test_name}.test.ts" \
    --bundle --platform=node --format=esm \
    --outfile="$test_dir/${test_name}.test.mjs" \
    --tsconfig=artifacts/mobile/tsconfig.json \
    --alias:react-native=./artifacts/mobile/tests/stubs/react-native.ts \
    '--alias:@/lib/session=./artifacts/mobile/tests/stubs/session.ts'
  node --test "$test_dir/${test_name}.test.mjs"
done

pnpm dlx esbuild@0.28.2 artifacts/mobile/tests/production-api.test.ts \
  --bundle --platform=node --format=esm \
  --outfile="$test_dir/production-api.test.mjs" \
  --tsconfig=artifacts/mobile/tsconfig.json \
  --alias:react-native=./artifacts/mobile/tests/stubs/react-native.ts \
  --alias:@react-native-async-storage/async-storage=./artifacts/mobile/tests/stubs/async-storage.ts \
  '--alias:@/lib/secureStorage=./artifacts/mobile/tests/stubs/secure-storage.ts' \
  '--alias:@/lib/session=./artifacts/mobile/tests/stubs/session.ts'
node --test "$test_dir/production-api.test.mjs"