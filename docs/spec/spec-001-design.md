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
- EntryDetail: the selected entry's metadata block (mtime/type/size and ctime/owner/mode)
- FilePreview: preview of file (text, image, PDF, audio, video, generic file)
- PathBreadcrumbs: clickable list of path elements
- PathSummary: number of files, dirs, weight, disk available on a compact line
- CommandBar: labeled operations and available keys with keyboard shortcuts
- CommandPalette: palette with commands that popup

Implementation:
- Pure JavaScript & HTML
- Select.js and select.tui for UI
- Shared component logic in `src/js/tcmd/components` (`ComponentName.js`),
  with `ComponentName.xml` (TUI) and `ComponentName.html` (web) presentations
  (components sharing a presentation bind the same source, e.g. Breadcrumbs
  uses `RowList.xml`/`RowList.html`); logic reads reactive cells via
  `unwrap` and registers events with `.sub(...)` (select.js semantics, shared
  by both renderers)
- CSS classes on the `.html` templates for HTML styling
- Bun as the runtime

References:

- Marta.sh: great UI and features
- Fman.io: the minimalist version
