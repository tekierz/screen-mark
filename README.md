<div align="center">

<img src="media/icon.png" width="96" alt="ScreenMark">

# ScreenMark

**Write screenplays in markdown. Export real screenplay PDFs — then plan the shoot.**

For Cursor and VS Code.

</div>

![ScreenMark editor and live preview](media/screenshots/hero.png)

## Why

Screenwriting apps lock your script in their format. ScreenMark keeps it in plain markdown you already know, in the editor you already use, under version control — and still gives you a correctly formatted PDF.

Then it goes further: your script is structured data, so ScreenMark reads it back to build scene breakdowns, shooting schedules, and budgets.

## Write

````markdown
---
title: Cold Brew
credit: written by
author: Your Name
---

## INT. COFFEE SHOP - DAY #1#

Maya wipes down the counter, eyeing the door.

**MAYA**
_(under her breath)_
> He's late. Again.

@CUT TO:
````

Files are `.smark` or `*.screen.md` — the `.md` flavor still renders fine on GitHub.

| Element | Syntax |
|---|---|
| Title page | frontmatter: `title`, `credit`, `author`, `draft`, `date`, `contact` |
| Act / section | `# ACT ONE` — outline only, never printed |
| Scene heading | `## INT. COFFEE SHOP - DAY` |
| Scene number | trailing `#4A#` — prints in both margins |
| Action | plain paragraphs |
| Character | `**MAYA**` on its own line (`**MAYA (V.O.)**` works) |
| Parenthetical | `_(under her breath)_` |
| Dialog | `> ` lines under a character |
| Dual dialog | `**JONAS** ^` — prints side by side |
| Lyric | `~ sung line` |
| Transition | `@CUT TO:` |
| Centered | `> THE END <` |
| Page break | `---` |
| Note | `<!-- fix pacing -->` — never printed |

A blank line ends a dialog block.

**Editor help:** syntax highlighting, character/scene/transition autocomplete, scene outline, folding, and snippets (`title`, `scene`, `dialog`, `dual`, `trans`).

## Export

| Command | Result |
|---|---|
| **Export PDF** | US Letter, Courier 12pt, industry margins, title page, `(MORE)`/`(CONT'D)`, dual-dialog columns |
| **Export Fountain** | standard `.fountain` for Highland, Slugline, Final Draft |
| **Open Preview** | live formatted preview that follows your scroll |
| **Number Scenes** | fills in missing `#n#`, never renumbers existing ones |

<img src="media/screenshots/pdf.png" width="380" alt="Exported screenplay PDF">

## Plan the shoot

Tag production elements inside any note:

```markdown
<!-- @prop: revolver, whiskey glass @wardrobe: red coat @vfx: muzzle flash -->
```

**Scene Breakdown** turns the script into a report (`.md` + `.csv`) — location, time, cast, tagged elements, and page length in eighths measured off the real PDF layout.

![Scene breakdown report](media/screenshots/breakdown.png)

**Shooting Schedule** packs scenes into days: grouped by location to cut company moves, day work before night, sized by `screenmark.pagesPerDay` (default 5).

![Shooting schedule](media/screenshots/schedule.png)

**Init Budget** scaffolds `budget.md`; **Budget Summary** recomputes totals and over/under variance in place. The **Film Project** panel in the Explorer keeps every script, report, and budget one click away.

Scene numbers are the glue — number once, and every report keeps pointing at the same scene as the script moves around.

## Install

Grab the `.vsix` from [Releases](../../releases) and:

```bash
cursor --install-extension screen-mark-0.2.1.vsix   # or: code --install-extension ...
```

## Develop

```bash
npm install
npm test          # 46 tests: parser, fountain, pdf, breakdown, budget
npm run build
npm run package   # → .vsix
```

Press <kbd>F5</kbd> to launch a dev host with the sample script open.

Everything that parses and renders lives in `src/core/` with no `vscode` imports, so it can move to a CLI or web tool unchanged. `src/features/` holds the editor integration.

## Roadmap

Call sheets, cast day-out-of-days, and budget estimates seeded from the breakdown.

## License

MIT
