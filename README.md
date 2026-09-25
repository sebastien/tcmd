# TinyCommand

TinyCommand `tcmd` is a midnight-commander-like CLI and desktop tool:

- Browse files in two panes (left and right)
- Operations over the current panes
- Keyboard and mouse navigation, inline file previews
- Command palette, bookmarks and tabs (later milestones)

References: [Marta.sh](https://marta.sh) for the UI, [fman.io](https://fman.io)
for the minimalist take.

## Running

```sh
bun install          # links deps/select.js and deps/select.tui
bun run tcmd         # open cwd (left) and ~ (right)
bun run tcmd /tmp ~  # open specific directories
```

Keys: `↑/↓` move, `Enter/→` open, `←/Bksp` parent, `Tab` switch pane,
`Space` mark, `v` preview, `^P` command palette, `^R` reload, `q` quit.

## Architecture

MVC with a presentation-agnostic core, so a web UI can share the same model
and controller:

```
src/js/tcmd/
  core/     Model + Controller. No rendering dependencies.
    fs.js        filesystem adapter interface (Node impl; web swaps in OPFS/HTTP)
    path.js      pure string path ops
    entries.js   filter/sort over file entries (dirs first)
    selection.js cursor/mark arithmetic
    pane.js      one pane: path, entries, derived view, cursor, marks
    session.js   two panes + active pane, preview, palette, dispatch
    keymap.js    key chords -> command ids
    commands.js  command registry; commands are `run(session, payload)`
  tui/      View (select.tui templates on OpenTUI)
    app.js       root layout + key handling; maps events to commands
    views/       FileList, FilePreview, Breadcrumbs, Summary, Toolbar, Palette
    catalogue.js component registration
    format.js, theme.js
  web/      future browser view (same core)
```

Decoupling rules:

- `core/` state is reactive cells (`select/state/cells`) and commands mutate it
  through `session.dispatch(id, payload)`; views only subscribe and publish.
- The filesystem is an injected adapter, so tests run on an in-memory fs and a
  future web build swaps the backend without touching the model.
- Views receive data via `in:` slots (cells keep their reactivity) and report
  intent via `pub()` bubbles (`list:select`, `crumbs:go`, …) that the app maps
  to commands.

## Dependencies

- [select.js](../select.js) — reactive cells and the template binding language
- [select.tui](../select.tui) — Select.js templates rendered on OpenTUI
- [@opentui/core](https://github.com/anomalyco/opentui) — terminal renderer
- Bun as the runtime

`deps/` symlinks to sibling checkouts; `scripts/link-deps.sh` (run as
postinstall) re-links `node_modules` so upstream edits propagate.

## Tests

```sh
bun test            # core unit tests + TUI snapshot/interaction tests
```

Core tests use an in-memory filesystem; TUI tests drive the real component
tree with OpenTUI's test renderer (frame capture, mock keys and mouse).

## Roadmap

- [x] Walking skeleton: two panes, navigation, breadcrumbs, summary, toolbar,
      command palette, text preview
- [ ] File operations (copy/move/delete/mkdir), completion, quick find, grep
- [ ] Image/PDF/audio/video previews
- [ ] Bookmarks, tabs
- [ ] Web UI on the same core
