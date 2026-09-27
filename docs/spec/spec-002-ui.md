# TinyCMD UI


Main UI:
- Header
- Two panels, Optional Preview
- Command bar

Each panel:
- Tab bar
- Breadcrumbs
- Contents
- Summary
- Filter bar (only while a filter is active)

Command bar:
- By default shows available keys
- Ctrl-P shows command palette, opens from the bottom
- : starts the command palette in scripting mode

Command palette:
- Type to complete, arrows to navigate, tab to complete, enter to complete and run
- By default shows UI level actions
- When in scripting mode, shows the available operations, and shows the filesets
  marked ($A, $B, ..., $FILE for preview) based on the available selections across panes and tabs.

Pane filter:
- `/` focuses a fuzzy filter input at the bottom of the active pane
- Typing narrows the listing with fzy scoring: directories first, then by score
- Enter keeps the filter and returns focus to the list; Esc clears it
- The filter row shows `/ <query>` whenever a filter is applied (key hints stay
  in the command bar); a `no match` alert appears when the query matches nothing

Operations:
- copy FROM TO (supports directories automatically)
- move FROM TO
- delete PATH (moves to trash)
- erase PATH (does not move to trash)
- stat PATH (info, including du)
- touch PATH
- sel BUF? PATH... adds/removes to selection  BUF would be +/- +A/-1 (default to +)
- edit PATH, edits with $EDITOR
- view PATH, previews
- open PATH, uses open/gnome-open
- run CMD, runs the command (alias to !)

```
.-------------------------------------------------------------.
| TinyCMD                                                     |
+-------------------++-------------------++-------------------+
| A               + || B               + || Filename    <PDF> |
+-------------------++-------------------++-------------------+
| path / to / file  || path / to / file  ||                   |
+-------------------++-------------------+|                   |
| * Dir       <dir> || * Dir       <dir> || <PREVIEW>         |
| * Dir       <dir> || * Dir       <dir> ||                   |
| - File        14B || - File        14B ||                   |
+-------------------++-------------------++-------------------+
| 10 dirs, 7 files… || 10 dirs, 7 files… || [O]pen [E]dit     |
+-------------------++-------------------++-------------------+
| Open[Enter] Parent[<] Switch[Tab] Mark[Spc] Preview[v] ..   |
+-------------------------------------------------------------+
```


