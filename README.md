# Court Card

Paste the daily tennis sign-up note from the group chat and get a reservation graphic. The graphic is a grid of courts × hours:

- **Court cell:** 6 circles, one per member spot. A solid circle is reserved and a blank circle is available. A grey `–` means the court isn't booked that hour.
- **สำรอง ("reserve") cell:** 4 red circles, one filled per member left over in that hour after every booked court is full. The display is capped at 4.

The card's header is `ลงชื่อสมาชิกเล่น <day>` ("member sign-up <day>"), and the subtitle shows when the card was rendered, in Thai with the Buddhist year.

The card updates as you type. The **View** button switches between two layouts, and the page remembers the last one used:

- **Court** (the default): courts across the top, one row per hour.
- **Time**: hours across the top, one row per court.

**Share** turns the card into an image. On a phone it opens the share sheet so you can send it straight to the chat; on a computer it downloads the file.

Everything runs in the browser, with no backend and no build step.

**Live:** https://diewland.github.io/court-card/

## Note format

```
ลงชื่อสมาชิกเล่น วันพฤหัส        ← title; the day name goes in the card header
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

- Anything above the `ลงชื่อสมาชิกเล่น` line is ignored, so it's fine to paste extra chat along with the note.
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

Run the tests (Node, no dependencies). Each sample note in `tests/notes/` is rendered in both views and compared with its expected grid:

```sh
node tests/run.js                              # all cases
node tests/run.js sunday-court-continuation    # one case
```

See [CLAUDE.md](CLAUDE.md) for the parsing and grid rules.
