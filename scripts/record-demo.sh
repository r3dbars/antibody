#!/usr/bin/env bash
# Record (or just run) the real Antibody demo. No staged transcript.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--vhs" ]] && command -v vhs >/dev/null; then
  exec vhs assets/demo.tape
fi
exec node src/cli.js demo "$@"
