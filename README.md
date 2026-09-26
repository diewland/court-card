# PA Render

Paste the daily tennis sign-up note from the group chat and get a reservation graphic. The graphic is a grid with one column per hour and one row per court. Each cell holds 6 circles, one per member spot:

- ● solid: reserved
- ○ blank: available
- **สำรอง** ("reserve") row: members left over in an hour after every booked court is full

Everything runs in the browser, with no backend and no build step.

**Live:** https://diewland.github.io/pa-render/

## Note format

```
ลงชื่อสมาชิกเล่น วันพฤหัส        ← title; the day name is shown on the card
1 Alice   17.00-20.00
2 Bob18.00-20.00                 ← a space before the time is optional
3 Carol 18-20                    ← hours only is fine
4 Dave   18:00-20:00 เพิ่มเวลา    ← free text after the time is ignored
5.Eve    17.00-18.00,19.00-20.00 ← skip a middle hour on one line…
6. Frank 17.00-18.00
         19.00-20.00             ← …or put the second time on the next line
7                                ← a number with no name is an open slot
—สมาชิกเต็ม—                      ← skipped
คอร์ท 3  16.00-17.00
         18.00-20.00             ← the same court booked twice
คอร์ท 2  17.00-20.00
**รอบ17.00 เล่น 4 ออก 4          ← lines starting with ** are comments
```

- Times can be written `17.00`, `17:00` or `17`.
- Players fill the courts booked in each hour in court-number order, 6 per court. A player is counted only in the hours they signed up for.
- Any line that can't be read is listed under the card, so a change in the note's format shows up there.

## Development

The site lives in `docs/` (`index.html`, `app.js`, `style.css`) and is served by GitHub Pages: Settings → Pages → Deploy from a branch → `master`, folder `/docs`.

Run it locally:

```sh
python3 -m http.server -d docs 8000
# open http://localhost:8000
```

Run the tests (Node, no dependencies). Each sample note in `tests/notes/` is rendered and compared with its expected grid:

```sh
node tests/run.js                              # all cases
node tests/run.js sunday-court-continuation    # one case
```

See [CLAUDE.md](CLAUDE.md) for the parsing and grid rules.
