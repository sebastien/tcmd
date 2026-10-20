# TinyCMD UI

## Layout

The TUI is an unframed workspace: a slim identity bar on top, the panes and
inspector, and the command bar — nothing boxed around them. The identity bar
reads `TinyCmd - HOST` (just `TinyCmd` without a host); the active paths live
in the pane crumbs. Its right-hand end carries the view mode and version: the
mode word is drawn letter by letter so every letter can carry its own gradient
colour — `explorer` along the Tiny blues, `commander` along the Cmd oranges,
the same two runs the logo shimmers along, clicking it toggles the view — and
the version follows, dim,
after it. Inside:

- Top bar: the TinyCmd identity (and host).
- Two panes, each its own single-line box, plus an optional inspector.
- Status bar: the fixed key shorthands (`[Commands :]`, `[Mark Spc]`,
  `[Filter /]`, `[Switch ⇥]`, `[Bookmarks b]`, `[Toggle Mode t]`, `[Help ?]`) on
  one line; the active pane's marked count trails the list, entries that do not
  fit are elided behind `…`, and a notice or error replaces the keys with a
  one-line status.
- Below the breakpoint the workspace is replaced by a resize hint.

### View modes

`t` (`view.toggleMode`) flips the workspace between two modes; the columns
each one shows are the only ones that exist, so focus can never park on an
invisible column.

- **explorer** (default): the destination is replaced by the *parent* of the
  current directory, so the columns read parent · current · preview — a Miller
  chain laid out left to right. The current column is the middle one and
  carries slightly more width (`flexGrow` 1.35 against 1 for its neighbours);
  the columns share `flexBasis: 0` so the whole row is distributed by those
  growers rather than by the content each column would claim.
- **commander**: source and destination, tiled evenly, plus the inspector.

The parent and preview columns are *mirrors*: the parent tracks the parent of
the current directory, the preview tracks the directory being previewed. Each
is a real pane — own breadcrumbs, filter, cursor, marks and detail —
but only its cursor and filter are its own: opening an entry, stepping up,
following one of its breadcrumbs or running a relative command moves the pane
it follows, which is what keeps the mirror in step. Whenever the current
directory changes, the parent mirror's cursor lands on the entry it shows, so
the chain always highlights where it is. `Tab` cycles the visible
columns (parent → current → preview → parent in explorer, source ⇄ destination
in commander), and clicking a column body or one of its rows makes it active.

Each pane draws all four edges (the two middle edges sit side by side), so each
pane's border can highlight independently. The active pane's box border and
header rule take the view mode's colour — the Tiny blue in explorer, the gold
accent in commander — and its cursor row uses
the strong cursor background; the inactive pane keeps the dim border and a
muted cursor, so focus reads from the border, the rule and the cursor alike.

Each pane is a single-line box containing:

- one header row (inset one column from the pane border, like the listing
  rows): the breadcrumbs — `/`-separated and clickable, each
  segment collapsed to its first letter (`/h/s/W/Perso/tcmd`) only when the
  width demands it, the basename always in full — and the inline filter
  (`/ query`), so a filter never shifts the listing or the other pane. The
  left pane is the source, the right the destination (the command panel's
  argument summaries name them `SRC`/`DST`);
- one header rule, separating the header row from the listing;
- contents (scrollable, cursorable); a symlink row prints its target after the
  name — `notes.md -> notes.txt`, `docs/ -> ../shared` — so a link reads as
  what it points at. The link's target resolves throughout: a link to a
  directory is a directory (it sorts, opens and previews as one), a link to a
  file carries the target's size, and the inspector reads through it: its
  header names the traversal (`notes.md -> notes.txt  <TXT>`) and its kind
  comes from the target's extension rather than the link's name. A broken link
  shows its target and previews as an empty card;
- one entry-detail line (a separator rule on top): the selected entry's
  `date · type · size · rights`, on a single row with the rights right-aligned.
  It follows the pane cursor and stays blank when the listing is empty; the
  date and size (the numeric fields) are bright, the type is coloured like the
  listing, and the rights are accented. When the pane is too narrow the size
  gives way first, then the rights, keeping the date and type.

The inspector is context-aware: text files show their leading content, other
kinds show a metadata card, and a directory shows *its own listing* — the same
column shape as a pane (breadcrumbs over a cursorable, clickable listing), in
both view modes, so a previewed directory is never a dead card. A `.gz` or
`.bz2` file is decompressed first: its inner name picks the kind and the
highlighter (`notes.txt.gz` badges as `<GZ · TXT>`) and its body previews as
text unless it decompresses to binary, which keeps the card. It sits beside
the panes at ≥100 columns and becomes a fullscreen viewer (`v`) below that;
`⇧V` maximizes it over the whole pane row in either mode, and the next `⇧V`
restores the previous layout (focus and pane widths included).

The text body highlights through OpenTUI's tree-sitter `code` renderable against
a shared `SyntaxStyle` built from the active theme (JavaScript, TypeScript,
Markdown and Zig ship with `@opentui/core`; a filetype with no bundled parser
draws plain). An image draws through the `image` renderable, whose Kitty
graphics / sixel / half-block protocol is auto-detected from the terminal, so
the picture lands in the inspector grid — inline and fullscreen alike. Formats
the decoder does not handle (`bmp`, `svg`) and `stat`-pinned entries keep the
metadata card. The browser presentation is unchanged: it renders the same
shared behaviours as plain text and never imports the TUI's renderables.

`Enter` opens the entry under the cursor: a directory descends into it, a text
file the host can edit opens in `$EDITOR`, and anything else — an image, media,
a binary body, or any file on a host with no editor (the web) — opens the same
fullscreen viewer, at any width. The viewer is modal: `Esc` or `v` closes it
and `O`/`E` still act on the file.

```text
  TinyCmd - devbox
┌───────────────────────────────────┐┌──────────────────────────────────┐╭─notes.txt  <TXT>──────────────────╮
│ /home                              ││ /etc                              ││hello                              │
│───────────────────────────────────││──────────────────────────────────││world                              │
│   documents/             <dir>    ││>  hosts                  19B     ││third line                         │
│   archive.tar.gz         10.0M    ││                                  ││                                   │
│>  notes.txt              26B      ││                                  ││                                   │
│   tiny.txt               4B       ││                                  ││                                   │
│                                   ││                                  ││                                   │
│                                   ││                                  ││                                   │
│                                   ││                                  ││                                   │
│                                   ││                                  ││                                   │
│───────────────────────────────────││──────────────────────────────────││                                   │
│  file · 26B          · -rw-r--r-- ││  file · 19B          · -rw-r--r--││                                   │
└───────────────────────────────────┘└──────────────────────────────────┘╰───────────────────────────────────╯
[Commands :] [Mark Spc] [Filter /] [Switch ⇥] [Bookmarks b] [Toggle Mode t] [Help ?]
```

## Responsive behavior

Breakpoints are driven by the renderer viewport (`size` cell fed from resize
events, with the renderer dimensions as a fallback):

- `< 64×16`: minimum-size hint replaces the workspace.
- `< 100 cols`: the inline inspector collapses; `v` opens the fullscreen viewer.
- `⇧V` maximizes the inspector over the pane row at any width, hiding the
  columns until the next press brings the previous layout back.
- The status bar keeps its shorthands on one line at every width; entries that
  do not fit are dropped and a trailing `…` marks the truncation. The palette
  and the `?` reference carry the full bindings.

## Pane filter

- `/` focuses a fuzzy filter input in the active pane's header row.
- Typing narrows the listing with fzy scoring: directories first, then by score.
- `Enter` keeps the filter and returns focus to the list; `Esc` clears it.
- A `no match` alert appears when the query matches nothing.
- While a filter is active the breadcrumbs yield the header row to it.

## Overlays

- Command palette (`^P`): centered, sectioned, with a selected-row marker and
  its own hint footer. `!` opens it in `run CMD` mode; the `:` key opens the
  command panel instead.
- Command panel (`:`/`m`): a Commando-style structured view over the commands.
  A filter input at the top narrows the operation list as you type — the
  matching command takes the cursor (`edit` highlights `edit`) — and the left
  column groups entries by purpose: Command, File, Create, Edit (amber), and
  Delete (red). Command includes the workspace-view toggle and Quit; File's `view`
  previews the selected path; Create holds `mkdir`/`new`; Edit (amber) holds
  `copy`, the link operations, and the permission and ownership changes;
  Delete holds `unlink` alongside `delete`/`erase`. Bold section titles head indented, alphabetized command names.
  A vertical rule divides the left column from
  the right one, which shows the selected
  operation's arguments bound from the live context — a `FROM`/`PATH`
  selection argument lists the SRC or active pane's marked paths (falling back
  to the cursor entry) with a `[x]`/`[ ]` toggle each, the basename in full
  followed by its dimmed parent directory, `TO` resolves to the DST pane's
  directory (editable in place), and textual arguments (`NAME`, `CMD`) are typed
  in a filled field. Labels and values start one cell in from the pane border
  (` PATH`, ` [value]`); each argument stacks its label over its value,
  read-only values appear plain and muted, and clicking one copies it to the clipboard
  (OSC 52 in the terminal, the Clipboard API in the browser); an operation with
  no arguments shows a `PATH` label over the active pane's path instead of a
  placeholder. `new`/`mkdir` show that current `PATH` above an editable `NAME`,
  and `chmod`/`chown` list `PATH` before `MODE`/`OWNER`. A permission
  argument (`chmod`'s `MODE`) is a compact grid: one row per `u`/`g`/`o` class
  with three clickable `R`/`W`/`X` cells, seeded from the selected file's
  current mode and assembled back into its octal value (`←`/`→` move between
  the cells and `Space` toggles one). `⌃O` opens the
  file picker on a path/destination argument: its path is an editable string,
  the matching entries are listed below as in a file panel (kind icons,
  right-aligned sizes, scrollbar) and `..` stays pinned at the top. Typing a
  directory enters it, a partial name filters the entries, and `↑↓`/`⇥` move
  between the path field and the list. The command list and arguments scroll
  with their cursors. The `[Run]`/`[Retry]`
  action sits one line below the last field, aligned left and tinted with the
  command category color; errors move focus to it, turn it into `[Retry]` and
  show the message in a framed block below the button. `replace` additionally
  previews each `old → new`
  mapping between the arguments and the action. A `[Close Esc]` close button
  sits in the top border, upper right. Amber (Edit) and red (Delete) actions
  are two-step: the first `[Run]` turns it into `[Confirm]` and prints the
  assembled command below it in the action's red/amber colour; the second
  executes (`Retry` after an error stays confirmed). A successful result briefly
  replaces the command bar at the bottom. The selection is transient: toggling edits a draft
  that never mutates the pane marks, and running executes the operation directly
  (`chmod`/`chown`/link/edit and Delete never steal the separate confirm
  overlay). Type to filter, `↑↓` move within a
  column, `⇥`/`⇧⇥` cycle the focus ring from the command through each argument
  and Run (wrapping at both ends), `Space` toggles, `↵` runs/confirms, `Esc` closes.

```text
╭─ Command · bookmark ─────────────────────────────[Close Esc]────────────╮
│ :                        │ bookmark                                     │
│──────────────────────────│──────────────────────────────────────────────│
│  Command                 │ NAME                                         │
│    bookmark              │ [(empty)]                                    │
│    quit                  │ PATH                                         │
│    view                  │ /home/documents                              │
│  File                    │                                              │
│    open                  │                                              │
│    run                   │                                              │
│    stat                  │ [Run]                                        │
│    …                     │                                              │
│  Create                  │                                              │
│    mkdir                 │                                              │
│    new                   │                                              │
│  Edit                    │                                              │
│    chmod                 │                                              │
│    chown                 │                                              │
│    copy                  │                                              │
│    hardlink              │                                              │
│    symlink               │                                              │
│    …                     │                                              │
│  Delete                  │                                              │
│    delete                │                                              │
│    erase                 │                                              │
│    unlink                │                                              │
│             type to filter  ⇥ args  Spc toggle  ↵ run                    │
╰─────────────────────────────────────────────────────────────────────────╯
```
- Bookmarks (`b`): centered. One panel filters the stored bookmarks by name or
  path; with an empty filter it also offers, as its first row, to add the
  cursor entry (or the pane directory) under a basename-derived name. `Enter`
  opens the selected bookmark, `⌫`/`Delete` removes it. Each bookmark remembers
  whether it is a file or a directory: opening a directory navigates into it,
  while opening a file selects it in its directory and previews it.
- Confirm (destructive script operations outside the panel): centered modal
  with the question and `[y]es [n]o`; panel actions use the inline
  `[Confirm]` step instead.
- Keys (`?`): a keymap-and-registry reference so it cannot drift from the
  actual bindings, laid out in two columns balanced by line count. Each entry
  uses the command bar's bracket style (`[Open →/⏎]`), listing every distinct
  chord for an action, with the title bright and keys in the accent colour; all
  brackets are padded to one width so the keys align. Section headings are
  uppercase and bold, and a `[Close Esc/?]` shorthand sits under a rule at the
  foot.

## Operations

- copy FROM TO (supports directories automatically)
- move FROM TO
- new PATH... (creates empty files, refusing existing paths)
- hardlink FROM TO (hard links, into TO when it is a directory)
- symlink FROM TO (symbolic links, into TO when it is a directory)
- chmod MODE PATH... (octal permission bits; the panel edits MODE as R/W/X cells for u/g/o)
- chown OWNER PATH... (USER[:GROUP], names or numeric ids)
- delete PATH (moves to trash)
- erase PATH (does not move to trash)
- unlink PATH... (removes symbolic links only, never their targets)
- stat PATH (info, including du)
- abspath PATH... (normalized absolute paths, shell-quoted for copy/paste, copied to the clipboard)
- realpath PATH... (absolute paths with symlinks resolved, copied to the clipboard)
- touch PATH
- sel BUF? PATH... adds/removes to selection  BUF would be +/- +A/-B (default to +; script-only, not in the command menu)
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
active pane is identified by the `>` cursor marker in its list, its highlighted
border and its bright header rule.

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

Each command-bar action renders as a plain bracket shorthand — `[Commands :]`:
the bracket and title in the text colour, the shortcut glyph in the accent
(primary for the context's main action, secondary for the rest), and a
trailing space before the next entry. Entries without a shortcut (the marked
count) render as a dimmed plain word. The shorthands stay on one line; entries
that do not fit are elided behind a trailing dimmed `…`, while the command
panel and the `?` reference keep every binding reachable.

Only the TUI consumes this theme; the web view keeps its CSS state classes.
