(function () {
  "use strict";

  // A time range: "17.00-20.00", "17:00-20:00" or hours only "18-20".
  var RANGE = "(\\d{1,2})(?:[.:](\\d{2}))?\\s*[-–]\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?!\\d)";
  var PLAYER_RE = /^(\d+)[.)]?\s*(.*)$/;
  var COURT_RE = /^(?:คอร์ท|คอร์ด|court)\s*(\d+)(.*)$/i;
  var TIME_ONLY_RE = new RegExp("^" + RANGE);
  var DIVIDER_RE = /^[—–\-_=~\s]+$/;
  // Skipped lines: the "members full" marker (e.g. —สมาชิกเต็ม—) and comments starting with **.
  var SKIP_RE = /สมาชิกเต็ม|^\*\*/;
  var DAY_RE = /วัน(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/;

  function hm(h, m) { return { h: +h, m: +(m || 0) }; }
  function toMin(t) { return t.h * 60 + t.m; }
  function fmt(t) { return String(t.h).padStart(2, "0") + ":" + String(t.m).padStart(2, "0"); }

  // Every valid range in a string, e.g. "17.00-18.00,19.00-20.00 เพิ่มเวลา" gives two.
  function ranges(str) {
    var out = [], re = new RegExp(RANGE, "g"), m;
    while ((m = re.exec(str))) {
      var r = { start: hm(m[1], m[2]), end: hm(m[3], m[4]), index: m.index };
      if (r.end.h <= 24 && r.start.m < 60 && r.end.m < 60 && toMin(r.start) < toMin(r.end)) out.push(r);
    }
    return out;
  }

  function parseNote(text) {
    var data = { title: "", day: "", players: [], openSlots: [], courts: [], unknown: [] };
    // The court or named player on the previous line; a bare time-range line adds to it.
    var lastCourt = null, lastPlayer = null;
    function addCourt(rs) {
      rs.forEach(function (r) { data.courts.push({ court: lastCourt, start: r.start, end: r.end }); });
    }
    text.split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line || DIVIDER_RE.test(line) || SKIP_RE.test(line)) return;

      var c = line.match(COURT_RE);
      if (c) {
        lastCourt = +c[1];
        lastPlayer = null;
        addCourt(ranges(c[2]));
        return;
      }
      // A bare time range continues the line above: another booking for that court,
      // or another range for that player (e.g. 17.00-18.00 then 19.00-20.00 on the next line).
      if (TIME_ONLY_RE.test(line)) {
        var more = ranges(line);
        if (lastPlayer) lastPlayer.ranges = lastPlayer.ranges.concat(more);
        else if (lastCourt !== null) addCourt(more);
        else data.unknown.push(line);
        return;
      }
      // "<slot> <name> <range>[,<range>...] <free text>". The name ends where the first range starts.
      var p = line.match(PLAYER_RE);
      if (p) {
        var rs = ranges(p[2]);
        var name = (rs.length ? p[2].slice(0, rs[0].index) : p[2]).trim();
        var slot = { slot: +p[1], name: name, ranges: rs };
        (name ? data.players : data.openSlots).push(slot);
        lastPlayer = name ? slot : null;
        lastCourt = null;
        return;
      }
      if (!data.title) {
        data.title = line;
        var d = line.match(DAY_RE);
        if (d) data.day = d[0];
        return;
      }
      data.unknown.push(line);
    });
    data.courts.sort(function (a, b) { return a.court - b.court; });
    return data;
  }

  var CAPACITY = 6;

  function overlaps(r, h) {
    return toMin(r.start) < (h + 1) * 60 && toMin(r.end) > h * 60;
  }
  function anyOverlap(rs, h) {
    return rs.some(function (r) { return overlaps(r, h); });
  }

  // Hourly columns from the earliest to the latest court time, no gaps.
  // One row per court number, even when it is booked in several ranges.
  // Players present in each hour fill the courts booked that hour, in court order.
  function buildGrid(data) {
    var bookings = data.courts;
    if (!bookings.length) return null;
    var lo = Math.min.apply(null, bookings.map(function (c) { return Math.floor(toMin(c.start) / 60); }));
    var hi = Math.max.apply(null, bookings.map(function (c) { return Math.ceil(toMin(c.end) / 60); }));
    var hours = [];
    for (var h = lo; h < hi; h++) hours.push(h);

    // bookings are sorted by court number, so rows come out sorted too.
    var courts = [];
    bookings.forEach(function (b) {
      var row = courts[courts.length - 1];
      if (!row || row.court !== b.court) courts.push(row = { court: b.court, ranges: [] });
      row.ranges.push(b);
    });

    var cells = courts.map(function () { return []; });
    var overflow = hours.map(function (h) {
      var n = data.players.filter(function (p) { return !p.ranges.length || anyOverlap(p.ranges, h); }).length;
      courts.forEach(function (c, i) {
        if (!anyOverlap(c.ranges, h)) { cells[i].push(null); return; }
        var filled = Math.min(CAPACITY, n);
        n -= filled;
        cells[i].push(filled);
      });
      return n;
    });
    return { hours: hours, courts: courts, cells: cells, overflow: overflow };
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function spotsSvg(filled) {
    var out = "";
    for (var i = 0; i < CAPACITY; i++) {
      var x = 12 + (i % 3) * 22, y = 12 + Math.floor(i / 3) * 22;
      out += '<circle class="spot ' + (i < filled ? "filled" : "open") + '" cx="' + x + '" cy="' + y + '" r="8"/>';
    }
    return '<svg class="spots" viewBox="0 0 68 46" role="img" aria-label="' + filled + "/" + CAPACITY + '">' + out + "</svg>";
  }

  function dot(kind) {
    return '<svg class="dot" viewBox="0 0 20 20" aria-hidden="true"><circle class="spot ' + kind + '" cx="10" cy="10" r="7"/></svg>';
  }

  function renderCard(data) {
    var g = buildGrid(data);
    var head = '<div class="card-head"><div class="ball" aria-hidden="true"></div><div>' +
      '<p class="day">' + esc(data.day || "ตารางเล่นเทนนิส") + "</p>" +
      (data.title ? '<p class="title">' + esc(data.title) + "</p>" : "") +
      "</div></div>";
    if (!g) return head + '<p class="empty">ยังไม่มีคอร์ท</p>';

    var th = g.hours.map(function (h) { return "<th>" + fmt({ h: h, m: 0 }) + "</th>"; }).join("");
    var rows = g.courts.map(function (c, i) {
      return '<tr><th scope="row">คอร์ท ' + c.court + "</th>" + g.cells[i].map(function (f) {
        return f === null ? '<td class="off">–</td>' : "<td>" + spotsSvg(f) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    var over = g.overflow.some(Boolean)
      ? '<tr class="over"><th scope="row">สำรอง</th>' + g.overflow.map(function (n) {
          return n ? '<td class="has">' + n + " คน</td>" : '<td class="off">–</td>';
        }).join("") + "</tr>"
      : "";

    return head +
      '<p class="summary"><b>' + data.players.length + "</b> คน · <b>" + g.courts.length + "</b> คอร์ท</p>" +
      '<div class="grid-wrap"><table class="grid"><thead><tr><th></th>' + th + "</tr></thead>" +
      "<tbody>" + rows + over + "</tbody></table></div>" +
      '<p class="legend">' + dot("filled") + " จองแล้ว " + dot("open") + " ว่าง</p>";
  }

  function renderUnknown(lines) {
    if (!lines.length) return "";
    return "อ่านไม่ออก " + lines.length + " บรรทัด:<ul>" +
      lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
  }

  var note = document.getElementById("note");
  var card = document.getElementById("card");
  var unknown = document.getElementById("unknown");
  var timer;

  function update() {
    var data = parseNote(note.value);
    card.innerHTML = renderCard(data);
    unknown.innerHTML = renderUnknown(data.unknown);
  }

  document.getElementById("render").addEventListener("click", update);
  note.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
  update();

  window.parseNote = parseNote;
  window.buildGrid = buildGrid;
})();
