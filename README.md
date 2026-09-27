# TinyCommand

```
 ██▓                                 ██▓
 ███▄▄  ███▀▀█▓▄  ███▀▀███▀▀█▓▄  ▄██▀▀███
 ███    ███ ▀▀▀▀  ███  ███  ███  ███  ███
 ███    ███  ███  ███  ███  ███  ███  ███
 ▀██▄▄  ███▄▄███  ███  ███  ███  ███▄▄███
```

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
  components/  Shared, renderer-agnostic component logic
    App.js            root controller: key + event -> dispatch
    bind.js           `ui.component(name).does(behaviors).using(source)` binding
    rows.js           keyed row-bag builders shared by both catalogues
    FileList.js …     one `.js` per component (behaviors + pure helpers)
    FileRow.js …      row behaviors shared by both engines
    format.js         presentation helpers (sizes/counts)
  tui/      View (select.tui templates on OpenTUI)
    app.js       binds App.js + App.xml + TUI environment
    catalogue.js binds each `components/*.js` to its `.xml` and registers tags
    index.js     TUI entry point
    theme.js     TUI colors
  web/      Browser view (select.js templates on the DOM, same core)
    app.js       binds App.js + App.html + web environment
    catalogue.js binds each `components/*.js` to its `.html`
    index.js     web entry point
    theme.js     web state classes
```

Each component is a triple: `ComponentName.js` (shared logic),
`ComponentName.xml` (TUI presentation) and `ComponentName.html` (web
presentation). Components that share a presentation bind the same source (e.g.
`Breadcrumbs` and `Toolbar` both use `RowList.xml` for the TUI and
`RowList.html` for the web). The `.js` imports neither renderer and reads
reactive cells with `unwrap` from `select/state/cells`; each catalogue injects
the renderer's runtime and theme through the `components/index.js` manifest,
binding via the shared `components/bind.js` helper
(`ui.component(name).does(behaviors).using(source)`, the contract both engines
implement). Published events are registered with `.sub(...)` (the select.js
contract) in both. List rows use the same keyed `Component.map` primitive over
reactive collections, sharing row behaviors over a `{ item, index, … }` bag
built by `components/rows.js`; cells stay in the bag and are read at the point
of use.

Decoupling rules:

- `core/` state is reactive cells (`select/state/cells`) and commands mutate it
  through `session.dispatch(id, payload)`; views only subscribe and publish.
- The filesystem is an injected adapter, so tests run on an in-memory fs and the
  web view swaps the backend without touching the model.
- Views receive data as cells (`in:` slots and mapped row bags keep cells
  reactive) and read them with `unwrap`; they report intent via `pub()`ed
  events (`list:select`, `crumbs:go`, …) that the app handles with `.sub(...)`
  and maps to commands.
- `components/` stays free of renderer imports; each `tui/` / `web/` catalogue
  injects the renderer's runtime and theme, so the same controller serves both.

## Dependencies

- [select.js](../select.js) — reactive cells and the template binding language
- [select.tui](../select.tui) — Select.js templates rendered on OpenTUI
- [@opentui/core](https://github.com/anomalyco/opentui) — terminal renderer
- Bun as the runtime

`deps/` symlinks to sibling checkouts; `scripts/link-deps.sh` (run as
postinstall) re-links `node_modules` so upstream edits propagate.

## Tests

```sh
bun test            # core, components, TUI and web tests
```

Core tests use an in-memory filesystem; TUI tests drive the real component
tree with OpenTUI's test renderer (frame capture, mock keys and mouse). Web
tests run the shared logic through select.js on a happy-dom document.

## Roadmap

- [x] Walking skeleton: two panes, navigation, breadcrumbs, summary, toolbar,
      command palette, text preview
- [ ] File operations (copy/move/delete/mkdir), completion, quick find, grep
- [ ] Image/PDF/audio/video previews
- [ ] Bookmarks, tabs
- [x] Web view on the same core (shared components rendered by select.js)
