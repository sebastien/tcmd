# TinyCommand

TinyCommand `tcmd` is a midnight-commander-like CLI and desktop tool. The idea is
quite simple:

- Browse files in two panes (left and right)
- Provide operations for the current panes

Core features:

- Keyboard and mouse navigation
- Completion, quick find and grep
- Inline file previews

Advanced features:

- Bookmarks
- Tabs

Main components:
- FileList: list of files, directory first, configurable details, selection, filter
- FilePreview: preview of file (text, image, PDF, audio, video, generic file)
- PathBreadcruss: clickable list of path elements
- PathSummary: number of files, dirs, weight, disk available on a compact line
- Toolbar: labeled operaions with keyboard shortuct
- CommandPalette: palette with commands that popup

Implementation:
- Pure JavaScript & HTML
- Select.js and select.tui for UI
- Shared component logic in `src/js/tcmd/components` (`ComponentName.js`),
  with `ComponentName.xml` (TUI) and `ComponentName.html` (web) presentations;
  logic reads reactive cells via `read()` and registers events with `.sub(...)`
  (select.js semantics, shared by both renderers)
- UI.css for HTML styling
- Bun as the runtime

References:

- Marta.sh: great UI and features
- Fman.io: the minimalist vesion
