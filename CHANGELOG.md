# Changelog

## 0.2.1

**Fixed**
- Preview no longer reloads its whole page on every keystroke. The reload storm caused flashing and, under memory pressure, got the panel killed — it looked like random crashes. Updates now stream into the existing page.

## 0.2.0

**Added**
- **Scene Breakdown** — per-scene report (`.md` + `.csv`) with location, time, cast, tagged elements, and page length in eighths measured off the real PDF layout.
- **Breakdown tags** — `<!-- @prop: revolver @wardrobe: red coat -->` attaches production elements to scenes.
- **Shooting Schedule** — scenes grouped by location, day before night, packed into days by `screenmark.pagesPerDay`.
- **Init Budget** / **Budget Summary** — `budget.md` workbook with totals and over/under variance.
- **Film Project** panel listing scripts with their generated docs and budgets.

**Fixed**
- Budget Summary could delete notes written below the totals table.
- Fountain export marked interior all-caps action lines with a literal `!`.
- Highlighting ignored indented lines the parser accepted.
- Oversized dual-dialog blocks split across pages without re-cueing.

## 0.1.0

First release: the ScreenMark dialect, syntax highlighting, live preview, scene outline and folding, autocomplete, snippets, PDF export, Fountain export, and scene numbering.
