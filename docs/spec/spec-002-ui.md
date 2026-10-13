# TinyCMD UI

## Layout

The TUI is an unframed workspace: a slim identity bar on top, the panes and
inspector, and the command bar — nothing boxed around them. The identity bar
reads `TinyCmd - HOST` (just `TinyCmd` without a host); the active paths live
in the pane crumbs. Its right-hand end carries the view mode and version: the
mode word is drawn letter by letter so every letter can carry its own gradient
colour — `explorer` along the Tiny blues, `commander` along the Cmd oranges,
the same two runs the logo shimmers along — and the version follows, dim,
after it. Inside:

- Top bar: the TinyCmd identity (and host).
- Two panes, each its own single-line box, plus an optional inspector.
- Status bar: bracket key shorthands (`[Open ⏎]`) wrapping onto as many rows
  as the width demands; the active pane's marked count trails the list, and a
  notice or error replaces the keys with a one-line status.
- Below the breakpoint the workspace is replaced by a resize hint.

### View modes

`t` (`view.toggleMode`) flips the workspace between two modes; the columns
each one shows are the only ones that exist, so focus can never park on an
invisible column.

- **commander** (default): source and destination, tiled evenly, plus the
  inspector.
- **explorer**: the destination is replaced by the *parent* of the current
  directory, so the columns read parent · current · preview — a Miller chain
  laid out left to right. The current column is the middle one and carries
  slightly more width (`flexGrow` 1.35 against 1 for its neighbours); the
  columns share `flexBasis: 0` so the whole row is distributed by those
  growers rather than by the content each column would claim.

The parent and preview columns are *mirrors*: the parent tracks the parent of
the current directory, the preview tracks the directory being previewed. Each
is a real pane — own breadcrumbs, filter, cursor, marks, detail and summary —
but only its cursor and filter are its own: opening an entry, stepping up,
following one of its breadcrumbs or running a relative command moves the pane
it follows, which is what keeps the mirror in step. `Tab` cycles the visible
columns (parent → current → preview → parent in explorer, source ⇄ destination
in commander), and clicking a column body or one of its rows makes it active.

Each pane draws all four edges (the two middle edges sit side by side), so each
pane's border can highlight independently. The active pane's box border and
header rule are tinted with the active border colour, and its cursor row uses
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
  gives way first, then the rights, keeping the date and type;
- one summary row (counts + disk, indented two spaces), always at the same row
  in both panes.

The inspector is context-aware: text files show their leading content, other
kinds show a metadata card, and a directory shows *its own listing* — the same
column shape as a pane (breadcrumbs over a cursorable, clickable listing), in
both view modes, so a previewed directory is never a dead card. It sits beside
the panes at ≥100 columns and becomes a fullscreen viewer (`v`) below that.

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
│  1 dirs, 3 files, 10.0M           ││  0 dirs, 1 files, 19B            ││ [Open O] [Edit E]                 │
└───────────────────────────────────┘└──────────────────────────────────┘╰───────────────────────────────────╯
[Open ⏎] [Parent ←] [Reload ^R] [Switch ⇥] [Mark Spc] [Bookmark b] [Bookmarks g] [Preview v] [Commands m]
[Palette ^P] [Filter /] [Quit q]
```

## Responsive behavior

Breakpoints are driven by the renderer viewport (`size` cell fed from resize
events, with the renderer dimensions as a fallback):

- `< 64×16`: minimum-size hint replaces the workspace.
- `< 100 cols`: the inline inspector collapses; `v` opens the fullscreen viewer.
- The status bar wraps its shorthands onto as many rows as the width demands
  (up to three at the minimum width); nothing is trimmed — the palette and the
  `?` reference carry the same bindings.

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
- Command panel (`:`/`m`): a Commando-style structured view over the operations.
  A filter input at the top narrows the operation list as you type — the
  matching command takes the cursor (`edit` highlights `edit`) — and the left
  column lists the operations alphabetically, ranked by match importance while
  filtering (a prefix match outranks a subsequence, signature-only matches
  rank last). Each operation shows its argument list, `delete`/`erase` in red
  and `move` in amber to flag risk. A vertical rule divides the left column
  from the right one, which shows the selected
  operation's arguments bound from the live context — a `FROM`/`PATH`
  selection argument lists the SRC or active pane's marked paths (falling back
  to the cursor entry) with a `[x]`/`[ ]` toggle each, the basename in full
  followed by its dimmed parent directory, `TO` resolves to the DST pane's
  directory (editable in place), and textual arguments (`BUF`, `NAME`, `CMD`)
  are typed in the field under the columns. A horizontal rule separates the
  columns from the `runs` line
  below, which previews the full command the draft maps to, as the shell
  would see it (the
  operation name plus shell-quoted arguments wrapping over as many lines as
  needed; a `«NAME»` placeholder marks a required argument still to fill, and
  the line reads as an error until it is runnable). The selection is transient:
  toggling edits a draft that never mutates the pane marks, and running
  executes the operation directly (confirms still route through the confirm
  overlay). Type to filter, `↑↓` move within a column, `⇥`/`⇧⇥` cycle the
  focus ring from the command through each argument (wrapping at both ends),
  `Space` toggles, `↵` runs the highlighted command, `Esc` closes.

```text
╭─ Command · bookmark ────────────────────────────────────────────────────╮
│ ›                                                                       │
│  bookmark [NAME] [PATH]    │ >  NAME                                    │
│  copy FROM TO              │    PATH  SRC · 1 selected                  │
│  delete PATH...            │    [x] documents  /home                    │
│  edit PATH                 │                                            │
│  erase PATH...             │                                            │
│  …                         │                                            │
│─────────────────────────────────────────────────────────────────────────│
│ runs                                                                    │
│ bookmark /home/documents                                                │
│             type to filter  ⇥ args  Spc toggle  ↵ run  Esc close        │
╰─────────────────────────────────────────────────────────────────────────╯
```
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

Each command-bar action renders as a plain bracket shorthand — `[Open ⏎]`:
the bracket and title in the text colour, the shortcut glyph in the accent
(primary for the context's main action, secondary for the rest), and a
trailing space before the next entry. Entries without a shortcut (the marked
count) render as a dimmed plain word. The shorthands wrap onto as many rows
as the width demands, and every registered `bar` command stays visible at
every width.

Only the TUI consumes this theme; the web view keeps its CSS state classes.
