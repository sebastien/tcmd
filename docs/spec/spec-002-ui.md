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

Command bar:
- By default shows available keys
- Ctr-P shows command palette, opens from the bottom
- : starts the command palette in scripting mode

Command palette:
- Type to complete, arrows to navigate, tab to complete, enter to complete and run
- By default shows UI level actions
- When in scripting mode, shows the available operations, and shows the filesets
  marked ($A, $B, ..., $FILE for preview) based on the available elections across panes and tabs.

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


