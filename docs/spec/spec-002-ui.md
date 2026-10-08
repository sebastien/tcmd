# TinyCMD UI

## Layout

The TUI is a single rounded frame. The frame title carries the active path
(`TinyCmd - HOST DIR/BASE`, compressed to fit). Inside:

- Top bar (inside the frame): the active path, advertised by the frame title.
- Two panes, each its own single-line box, plus an optional inspector.
- Status bar: context key hints on the left, notices/errors and marks on the
  right.
- Below the breakpoint the workspace is replaced by a resize hint.

Each pane draws all four edges (the two middle edges sit side by side), so each
pane's border can highlight independently. The active pane's box border and
header rule are tinted with the active border colour, and its cursor row uses
the strong cursor background; the inactive pane keeps the dim border and a
muted cursor, so focus reads from the border, the rule and the cursor alike.

Each pane is a single-line box containing:

- one header row: the **SRC**/**DST** role label (active panes accented),
  breadcrumbs, and the inline filter (`/ query`), so a filter never shifts the
  listing or the other pane;
- one header rule, separating the header row from the listing;
- contents (scrollable, cursorable);
- one entry-detail line (a separator rule on top): the selected entry's
  `date · type · size · rights`, on a single row with the rights right-aligned.
  It follows the pane cursor and stays blank when the listing is empty; the
  date and size (the numeric fields) are bright, the type is coloured like the
  listing, and the rights are accented. When the pane is too narrow the size
  gives way first, then the rights, keeping the date and type;
- one summary row (counts + disk, indented two spaces), always at the same row
  in both panes.

The inspector is context-aware: text files show their leading content, other
kinds show a metadata card, and a directory shows a directory card rather than
an empty box. It sits beside the panes at ≥100 columns and becomes a fullscreen
viewer (`v`) below that.

```text
╭─ TinyCmd · devbox ───────────────────────────────────────────────────────────────╮
│┌──────────────────────────────────┐┌──────────────────────────┐╭─notes.txt <TXT>─╮│
││SRC  / home /                    ││DST  / etc               ││                 ││
││──────────────────────────────────││──────────────────────────││                 ││
││>  documents/            <dir>    ││>  hosts          19B     ││hello            ││
││   notes.txt              26B     ││                          ││world            ││
││   archive.tar.gz         10.0M   ││                          ││third line       ││
││   tiny.txt                4B     ││                          ││                 ││
││──────────────────────────────────││──────────────────────────││                 ││
││2026-10-06 07:55 · file ·… -rw-r--││  dir ·        drwxr-xr-x ││                 ││
││  2 dirs · 3 files · 10.0M        ││  1 file · 19B            ││[O]pen [E]dit    ││
│└──────────────────────────────────┘└──────────────────────────┘╰─────────────────╯│
╰─ ↵open  ←parent  ⇥pane  ␣mark  b bookmark  g bookmarks  / filter  ? help ────────╯
```

## Responsive behavior

Breakpoints are driven by the renderer viewport (`size` cell fed from resize
events, with the renderer dimensions as a fallback):

- `< 64×16`: minimum-size hint replaces the workspace.
- `< 100 cols`: the inline inspector collapses; `v` opens the fullscreen viewer.
- `< 110 cols`: the status bar keeps only its essential hints; the rest stay in
  the palette and the `?` reference.

## Pane filter

- `/` focuses a fuzzy filter input in the active pane's header row.
- Typing narrows the listing with fzy scoring: directories first, then by score.
- `Enter` keeps the filter and returns focus to the list; `Esc` clears it.
- A `no match` alert appears when the query matches nothing.
- While a filter is active the breadcrumbs yield the header row to it.

## Overlays

- Command palette (`^P`): centered, sectioned, with a selected-row marker and
  its own hint footer. `:` opens it in scripting mode.
- Bookmarks (`b`/`g`): centered. `b` opens a naming prompt (defaulting to the
  path's basename) for the cursor entry (or the pane directory), then `g` opens
  a fzf-style picker over bookmark names and paths. Each bookmark remembers
  whether it is a file or a directory: jumping to a directory opens it, while
  jumping to a file selects it in its directory and previews it.
- Confirm (destructive operations): centered modal with the question and
  `[y]es [n]o`.
- Keys (`?`): a grouped reference built from the live keymap and command
  registry, so it cannot drift from the actual bindings.

## Operations

- copy FROM TO (supports directories automatically)
- move FROM TO
- delete PATH (moves to trash)
- erase PATH (does not move to trash)
- stat PATH (info, including du)
- touch PATH
- sel BUF? PATH... adds/removes to selection  BUF would be +/- +A/-B (default to +)
- bookmark [NAME] [PATH] lists, adds or removes named bookmarks
- edit PATH, edits with $EDITOR
- view PATH, previews
- open PATH, uses open/gnome-open
- run CMD, runs the command (alias to !)

## Theme

`tui/theme.js` resolves a semantic token set at load:

- `TCMD_THEME=dark|light|mono` forces a variant;
- `NO_COLOR` or `TERM=dumb` falls back to mono;
- otherwise dark.

Mono uses terminal defaults throughout and relies on markers (`>`, `*`,
`[`/`]`) and layout, never colour alone. The same applies at every level: the
active pane, selected row and current file all have a non-colour carrier — the
active pane is identified by the `>` cursor marker in its list (and its SRC/DST
label position).

The token set is grouped (see `tui/theme.js` for the palette values):

- surfaces: `surfaceBg`, `overlayBg`, `mutedBg` (neutral badge grey),
  `cursorBg` (active pane cursor row), `cursorInactiveBg` (inactive pane
  cursor), `selectionBg`;
- text: `textFg`, `textSecondaryFg`, `textHeadingFg`;
- borders: `borderSecondaryFg`/`borderSecondaryActiveFg` (pane boxes and
  header rules, inactive/active) and
  `borderPrimaryFg`/`borderPrimaryActiveFg` (frame and modal overlays);
- accent: `accentFg`/`accentBg` (cursor, active pane label) and
  `accentSecondaryFg`/`accentSecondaryBg` (marks);
- semantic states, each as a background + foreground pair for badges: error,
  warning and tip;
- content: `fileFg`, `linkFg` (symlinks), `devFg` (device nodes) and `dirFg`.

Each command-bar action renders as a Yazi-style Powerline pill: the action
name (`OP`) is the accent block with dark text on it, and the shortcut
(`KEY`) is the accent drawn on a neutral grey. Powerline caps bound the two
segments — the accent cap on the grey, then the grey cap on the terminal
default — so the accent tapers into the grey and the grey back into the
default. The most important action uses the primary accent, the rest the
secondary.

Only the TUI consumes this theme; the web view keeps its CSS state classes.
