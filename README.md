# TinyCommand

```
 ██▓                                 ██▓
 ███▄▄  ███▀▀█▓▄  ███▀▀███▀▀█▓▄  ▄██▀▀███
 ███    ███ ▀▀▀▀  ███  ███  ███  ███  ███
 ███    ███  ███  ███  ███  ███  ███  ███
 ▀██▄▄  ███▄▄███  ███  ███  ███  ███▄▄███
```

TinyCommand `tcmd` is a midnight-commander-like CLI and desktop tool:

- Browse files in two panes (the left is the source, the right the
  destination)
- Named bookmarks: `b` records the cursor entry (or the pane directory) under
  a name defaulting to its basename, remembering whether it is a file or a
  directory; `g` opens a fzf-style picker over bookmark names and paths. A
  directory bookmark opens to show its contents, a file bookmark is selected
  and previewed in its directory.
- Operations over the current panes: copy, move, delete/erase, stat, touch,
  selection buffers, edit/view/open and shell commands
- Command palette with UI actions, plus a scripting mode (`:`) that completes
  operations and the available filesets ($A, $B, …, $FILE)
- Keyboard and mouse navigation, inline file previews
- Bookmarks and quick find (later milestones)

References: [Marta.sh](https://marta.sh) for the UI, [fman.io](https://fman.io)
for the minimalist take.

## Running

Install [Bun](https://bun.sh), then run without installing tcmd globally:

```sh
npm x @ssebastien/tcmd
npm x @ssebastien/tcmd -- /tmp ~
```

Or install it globally with `npm install -g @ssebastien/tcmd` and run `tcmd`.

For development:

```sh
bun install          # installs @ssebastien/select and @ssebastien/select-tui
bun run tcmd         # open cwd (left) and ~ (right)
bun run tcmd /tmp ~  # open specific directories
```

Keys: `↑/↓` move (`^↑/^↓` jump a few lines), `Enter/→` open, `←/Bksp` parent,
`Esc`/`⇧Esc` history back/forward, `Tab`/`⇧Tab` switch panes
(`⇧Tab` goes back), `Space` mark, `b` bookmark the cursor entry (or the pane
directory) under a basename-defaulted name, `g` jump to a bookmark, `:` or `m`
open the command panel (Commando: operations, their arguments, and the live
resolved command), `v` preview (fullscreen viewer when the terminal is narrow),
`O`/`E` open/edit the previewed file, `/` fuzzy-filter the active pane (`Enter`
keeps it, `Esc` clears), `^P` command palette, `!` run a shell command, `^R`
reload, `?` key reference, `q` quit.

The workspace opens with a slim identity bar (`TinyCmd - HOST`) over an
unframed tiling of pane boxes (the two middle edges sit side by
side) labelled **SRC** (left, source) / **DST** (right, destination), with a
header row (label + clickable breadcrumbs — collapsed to first letters like
`/h/s/W/Perso/tcmd` when the width demands — + the inline filter) separated by a
rule from the listing, an entry-detail line for the selected entry, and one
summary row, so the two panes stay aligned. The detail line shows
`date · type · size · rights` with the rights right-aligned, the date and size
bright, and the size/rights dropping out when the pane is too narrow; the
summary row is indented to match. The active pane's border and header
rule are highlighted and its cursor row uses the strong cursor colour, while
the inactive pane stays dim with a muted cursor. Rows lead with a yazi-style
Nerd Font icon (folder/link kind icons plus a per-extension icon, `Makefile`,
`Dockerfile` and dotfiles included), on unless `TCMD_ICONS=0` — it needs a
Nerd-Font-patched terminal font, and the web view never shows icons. A
context-aware inspector sits
on the right when the terminal is at least 100 columns wide, and becomes a
fullscreen viewer below that. The status bar lists every binding as a bracket
shorthand (`[Open ⏎]`) wrapping over as many rows as the width demands — the
marked count trails the list, and a notice or error swaps the keys for a
one-line status. Below 64×16
the app shows a resize hint instead of the workspace.

### Web version

The web view runs the same core on select.js and offers two filesystem
backends:

- **OPFS** (preferred): private browser storage, seeded with a demo tree on
  first load. Needs a secure context (`localhost` or https).
- **HTTP API** (automatic fallback, or `?fs=http`): the server exposes the
  real filesystem over `/api/*`, using the same Node adapter as the TUI.

```sh
make run-local       # build and serve both backends (alias to `bun run web`)
bun run web          # build and serve both backends on http://localhost:8787
bun run web:build    # bundle only, into public/main.js
bun run web:serve    # serve the existing bundle plus /api/*
```

`make run-local` is the local dev entry point (it wraps `bun run web` and
honours `TCMD_WEB_PORT`, default 8787). The Makefile bootstraps the LittleSDK
into `deps/sdk` for the standard `make` targets.

Appending `?fs=opfs` or `?fs=http` to the URL forces one backend. The HTTP
backend needs the page served by `bun run web:serve` (a plain static server
only supports OPFS); the server binds to loopback and requires a per-process
token injected into `index.html`. `TCMD_WEB_ROOT=/some/dir` confines the API
(default `/`, the same access as `bun run tcmd`), but it is not a sandbox:
don't expose the port. With OPFS, deleting moves entries to `/.trash`; the API
uses the desktop trash. Open/edit/run are unavailable in the browser either
way (the null host adapter reports it in the command bar); everything else —
navigation, marks, scripting, copy/move/erase — works on either
backend. `public/index.html` is the host page; `public/main.js` is generated.

## Architecture

MVC with a presentation-agnostic core, so a web UI can share the same model
and controller:

```
src/js/tcmd/
  core/     Model + Controller. No rendering dependencies.
    fs.js        filesystem adapter interface (Node impl; web swaps in OPFS/HTTP)
    os.js        host adapter (open/edit/run; null impl for the web)
    path.js      pure string path ops
    entries.js   filter/sort over file entries (dirs first)
    selection.js cursor/mark arithmetic
    directory.js one pane's directory: path, entries, view, cursor, marks
    pane.js      one directory, proxying its cells
    bookmarks.js named bookmarks (path + file/dir kind) + the memory/file stores
    panel.js     command panel: operation args bound from the live context
    session.js   two panes + active pane, preview, palette, panel, dispatch
    keymap.js    key chords -> command ids
    commands.js  command registry; commands are `run(session, payload)`
    operations.js scripting operations (copy/move/delete/erase/stat/sel/…)
    script.js    scripting line parser, runner and palette completions
  components/  Shared, renderer-agnostic component logic
    App.js            root controller: key + event -> dispatch
    bind.js           `ui.component(name).does(behaviors).using(source)` binding
    rows.js           keyed row-bag builders shared by both catalogues
    FileList.js …     one `.js` per component (behaviors + pure helpers)
    FileRow.js …      row behaviors shared by both engines
    format.js         presentation helpers (sizes/counts)
  tui/      View (select.tui templates on OpenTUI)
    app.js       binds App.js + App.xml + TUI environment; size/help cells
    catalogue.js binds each `components/*.js` to its `.xml` and registers tags
    frame.js     TUI-only chrome: frame title, breakpoints
    help.js      TUI-only `?` key-reference overlay behaviors
    index.js     TUI entry point; feeds `size` from renderer resize events
    theme.js     TUI palette resolver (dark/light/mono, NO_COLOR)
  web/      Browser view (select.js templates on the DOM, same core)
    app.js       binds App.js + App.html + web environment
    catalogue.js binds each `components/*.js` to its `.html`
    index.js     web entry point: `main(session, selector)`
    main.js      browser bootstrap: backend choice + session (bundled)
    opfs.js      OPFS filesystem adapter (browser storage)
    http.js      filesystem adapter over the `/api` JSON endpoints
    server.js    dev server: `public/` + `/api/*` (used by `bun run web:serve`)
    seed.js      demo tree written to OPFS on first load
    header.js    web-only title bar behaviors (+ `header.html`)
    theme.js     web state classes
  vendor/   Vendored third-party code kept close to upstream
    fzy.js       fzy fuzzy scoring algorithm (MIT)
```

Each component is a triple: `ComponentName.js` (shared logic),
`ComponentName.xml` (TUI presentation) and `ComponentName.html` (web
presentation). Components that share a presentation bind the same source (e.g.
`Breadcrumbs` uses `RowList.xml` for the TUI and
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

TUI-only components live under `tui/` (`frame.js`, `help.js`) and their `.xml`
templates under `components/`; they are registered only by `tui/catalogue.js`.
Web-only components live under `web/` (`header.js` + `header.html`). Shared
behaviors only ever grow additively (a new key for a new presentation),
so the other engine's presentation and the parity tests keep working unchanged.

Decoupling rules:

- `core/` state is reactive cells (`select/state/cells`) and commands mutate it
  through `session.dispatch(id, payload)`; views only subscribe and publish.
- The filesystem and host are injected adapters (`core/fs`, `core/os`), so tests
  run on an in-memory fs and the web view swaps the backend without touching
  the model.
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
- [fzy.js](https://github.com/jhawthorn/fzy.js) — vendored fuzzy scoring (MIT,
  see `src/js/tcmd/vendor/`)
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

- [x] Walking skeleton: two panes, navigation, breadcrumbs, summary, command
      bar, command palette, text preview
- [x] File operations (copy/move/delete/erase/stat/touch/sel), scripting mode
      with the `$A`/`$B` pane filesets
- [x] Scripting completion (operations, filesets, active-directory and nested
      paths)
- [x] Pane fuzzy filtering (`/` to filter, `Enter` to keep, `Esc` to clear)
- [x] Named bookmarks (`b` records, `g` jumps, persisted to a JSON file)
- [ ] Quick find, grep
- [ ] Image/PDF/audio/video previews
- [x] Web view on the same core (shared components rendered by select.js)
- [x] Pane navigation history (`Esc`/`⇧Esc` back/forward)
