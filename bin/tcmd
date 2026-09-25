#!/usr/bin/env bun
// TinyCommand `tcmd` entry point.
const paths = process.argv.slice(2).filter((arg) => arg !== "-")
await import("../src/js/tcmd/tui/index.js").then((tui) => tui.main(paths))
