#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ "$(uname -m)" != "arm64" ]; then
  echo "Esta version requiere un Mac con Apple Silicon (ARM64)."
  exit 1
fi
exec ./runtime/node/bin/node ./launcher.mjs "$@"
