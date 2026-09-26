# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

pa-reader turns a tennis group's daily sign-up note, pasted from chat in Thai, into a reservation graphic. The graphic is a grid with one column per hour and one row per court, and each cell shows 6 circles (solid means reserved, blank means available). Everything runs in the browser. There is no backend, build step, package manager or dependencies.

`docs/` is the website root, served by GitHub Pages from `master` → `/docs`; `.nojekyll` turns Jekyll off. All the site code lives in `docs/`: `index.html`, `app.js` and `style.css`.

## Commands

- Serve locally: `python3 -m http.server -d docs 8000`, then open http://localhost:8000.
- Tests: `node tests/run.js` runs all cases, and `node tests/run.js sunday-court-continuation` runs one. There are no dependencies.
  - Each case is a sample note in `tests/notes/<case>.txt` and an expected card in the `CASES` table in `tests/run.js`. The expected card records the day, the player count, the hour columns, solid circles per court cell ("-" = not booked) and the สำรอง ("reserve") row.
  - The runner evaluates `docs/app.js` with a stubbed `document` and reads the values back from the rendered `#card` HTML.
  - It also fails on any unreadable line or any cell without exactly 6 circles.
  - When the note format changes, add a new note file and a `CASES` entry. The expected numbers must be worked out by hand, not copied from the output.
  - Sample notes use placeholder English names (Alice, Bob, …), never real members' names. The same goes for `README.md` and `CLAUDE.md`.
  - Outside the page, `app.js` also exposes `window.parseNote` and `window.buildGrid` for ad-hoc checks.
- Visual check: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1000,700 --screenshot=out.png file://$PWD/docs/index.html`. Headless Chrome won't go below a 500px viewport.

## Architecture (`docs/app.js`)

`app.js` is a single ES5 IIFE and follows one pipeline: `parseNote(text)` → `buildGrid(data)` → `renderCard(data)` returns an HTML string that is set as `#card.innerHTML`. It re-renders on textarea input (debounced 250ms) and on the Render button.

**`parseNote`** reads the note line by line and returns `{title, day, players[], openSlots[], courts[], unknown[]}`. Players are `{slot, name, ranges[]}`. Courts are flat `{court, start, end}` entries, one per booking, sorted by court number. Times are `{h, m}`. Rules are checked in this order:
- Blank lines, dividers (`————`) and any line containing `สมาชิกเต็ม` ("members full") are skipped, as are comment lines starting with `**`.
- A court line starts with `คอร์ท`, `คอร์ด` or `court`, then a number and one or more ranges.
- A line holding only a time range continues the line above it, tracked with `lastCourt` and `lastPlayer`. After a court line it is another booking for that court. After a named player it adds another range to that player. Otherwise it goes into `unknown`.
- A player line is `<slot>[.)] <name> <range>[,<range>…] <free text>`. The name ends where the first range starts, and spaces are optional (`Alice16.00-20.00`, `12Bob 16:00-17.00`). Trailing free text is ignored (`Pm.`, `*เพิ่มเวลา` = "added time"). A slot number with no name is an open slot.
- A range is `HH.MM-HH.MM`, `HH:MM-HH:MM` or hours only (`18-20`), and is parsed by `ranges()` everywhere. Invalid ranges are dropped: end ≤ start, or an end hour above 24.
- The first remaining line is the title, and the Thai day name (`วันศุกร์` etc.) is extracted from it.
- Any other line goes into `unknown[]`, which is shown under the card so format changes are noticed.

A member can skip a middle hour by putting both ranges on one line (`17.00-18.00,19.00-20.00`) or the second range on the next line. A court can be booked twice the same way.

**`buildGrid`** works like this:
- Columns are hourly slots with no gaps, from the earliest court start to the latest court end. A column labelled `18:00` covers 18:00–19:00, and the end hour is not a column.
- There is one row per court number, sorted. A court booked several times (e.g. court 3 at 16–17 and 18–20) merges into one row with several `ranges`.
- In each hour, count the players with any range overlapping that hour; players with no time count for every hour. Fill the courts booked that hour in court order, `CAPACITY = 6` per court.
- Players left over go into `overflow[hour]`, which is rendered as the `สำรอง` ("reserve") row. Unbooked cells are `null` and render as a grey `–` cell.

Card text is Thai.

## Styling (`docs/style.css`)

Colours are CSS custom properties on `:root`. Each one is redefined twice for dark mode: under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`. Add new tokens to all three blocks. The font is Noto Sans Thai from Google Fonts. The desktop layout is a 320px input column and a card that sizes to the grid (`width: max-content`, page capped at 1120px). This fits about 6 hour-columns without horizontal scroll. Below 800px the columns stack, and below 560px the grid cells shrink.
