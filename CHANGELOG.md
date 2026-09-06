# Changelog

## 0.3.2

**Fixed**
- Comment-only lines preserve dialogue and action continuity, including multiline notes and notes before title frontmatter. Actual blank lines still separate paragraphs.
- Outline sections nest beneath the nearest shallower section, with scenes inside their current section and ranges matching folding.
- Inline notes receive comment highlighting within screenplay structures, with multiline comment state recovering after closure.

**Verification**
- Add real TextMate/Oniguruma scope assertions and extend isolated editor checks through short-screenplay revision, numbering, preview, exports and production reports.

## 0.3.1

**Fixed**
- Preserve user budget content with bounded generated-table ownership, escaped cells, strict amounts and exact cent arithmetic.
- Bound PDF fields and continuation pages; reject unsupported glyphs, empty output and title overflow before writing. Preserve Fountain types through explicit forcing and reject ambiguous literals.
- Keep preview updates on the current document; preserve comments and UTF-16 offsets during numbering; fix marker completion ranges and multi-root budget destinations.
- Escape report cells, safely collect production tags, and measure conservative scene eighths from retained rows in the complete paginated layout. Label dialogue-derived names as speaking cast.

**Release**
- Pin Bun and the VSIX packager; bundle PDFKit runtime data and third-party notices. Verify the locally packaged artifact in an isolated real editor host.

## 0.3.0

**Added**
- **ScreenMark sidebar** — a dedicated Activity Bar icon opening an **Actions** panel (every command as a clickable button, grouped by task) and the **Film Project** tree, which moved here from the Explorer.
- Editor title-bar buttons for Open Preview and Export PDF.

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
