#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

echo "Checking Node.js syntax..."
node --check server.js

find public -type f -name '*.js' -print | while IFS= read -r file; do
  echo "  $file"
  node --check "$file"
done

echo "All JavaScript syntax checks passed."
