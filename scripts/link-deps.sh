#!/usr/bin/env bash
# Replace bun-installed copies of the local file: deps with symlinks so
# upstream edits propagate without reinstalling.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -L node_modules/select ] && [ -L node_modules/select.tui ]; then
	exit 0
fi
rm -rf node_modules/select node_modules/select.tui
ln -s ../deps/select.js node_modules/select
ln -s ../deps/select.tui node_modules/select.tui
