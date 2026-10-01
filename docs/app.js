(function () {
  "use strict";

  // A time range: "17.00-20.00", "17:00-20:00" or hours only "18-20".
  var RANGE = "(\\d{1,2})(?:[.:](\\d{2}))?\\s*[-–]\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?!\\d)";
  var PLAYER_RE = /^(\d+)[.)]?\s*(.*)$/;
  var COURT_RE = /^(?:คอร์ท|คอร์ด|court)\s*(\d+)(.*)$/i;
  var TIME_ONLY_RE = new RegExp("^" + RANGE);
  var DIVIDER_RE = /^[—–\-_=~\s]+$/;
  // A slot crossed out with dashes/slashes (e.g. "1 ———-/-") is a cancellation: an open slot.
  var CANCELLED_RE = /^[—–\-_=~\/\\.\s]*$/;
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
        if (CANCELLED_RE.test(name)) name = "";
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
  var RESERVE_CAPACITY = 4;

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

  // kind "reserve" draws the สำรอง cell: 4 red-tone circles in a 2×2 block instead of 6 in 3×2.
  function spotsSvg(filled, kind) {
    var total = kind === "reserve" ? RESERVE_CAPACITY : CAPACITY;
    var cols = total / 2, x0 = (68 - (cols - 1) * 22) / 2, out = "";
    for (var i = 0; i < total; i++) {
      var x = x0 + (i % cols) * 22, y = 12 + Math.floor(i / cols) * 22;
      out += '<circle class="spot ' + (i < filled ? "filled" : "open") + '" cx="' + x + '" cy="' + y + '" r="8"/>';
    }
    return '<svg class="spots' + (kind ? " " + kind : "") + '" viewBox="0 0 68 46" role="img" aria-label="' + filled + "/" + total + '">' + out + "</svg>";
  }

  function dot(kind, reserve) {
    return '<svg class="dot' + (reserve ? " reserve" : "") + '" viewBox="0 0 20 20" aria-hidden="true"><circle class="spot ' + kind + '" cx="10" cy="10" r="7"/></svg>';
  }

  function spotsCell(f) {
    return f === null ? '<td class="off">–</td>' : "<td>" + spotsSvg(f) + "</td>";
  }
  // A สำรอง cell: 4 red-tone circles, one filled per reserve player, capped at 4.
  function overCell(n) {
    return '<td class="over-cell">' + spotsSvg(Math.min(RESERVE_CAPACITY, n), "reserve") + "</td>";
  }

  // When the card was rendered, e.g. "27 กันยายน 2569 เวลา 18:05 น." (Buddhist year).
  function thaiNow() {
    return new Date().toLocaleString("th-TH", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) + " น.";
  }

  // view "time": one column per hour, one row per court, สำรอง as the last row.
  // view "court": the same grid turned sideways, one column per court, one row per hour.
  function renderCard(data, view) {
    var g = buildGrid(data);
    var head = '<div class="card-head"><div class="ball" aria-hidden="true"></div><div>' +
      '<p class="day">' + esc(data.day ? "ลงชื่อสมาชิกเล่น " + data.day : data.title || "ตารางเล่นเทนนิส") + "</p>" +
      '<p class="title">' + thaiNow() + "</p>" +
      "</div></div>";
    if (!g) return head + '<p class="empty">ยังไม่มีคอร์ท</p>';

    var hourLabels = g.hours.map(function (h) { return fmt({ h: h, m: 0 }); });
    var courtLabels = g.courts.map(function (c) { return "คอร์ท " + c.court; });
    var th, rows;
    if (view === "court") {
      th = courtLabels.concat(["สำรอง"]).map(function (l) { return "<th>" + l + "</th>"; }).join("");
      rows = hourLabels.map(function (l, j) {
        return '<tr><th scope="row">' + l + "</th>" +
          g.cells.map(function (row) { return spotsCell(row[j]); }).join("") +
          overCell(g.overflow[j]) +
          "</tr>";
      }).join("");
    } else {
      th = hourLabels.map(function (l) { return "<th>" + l + "</th>"; }).join("");
      rows = courtLabels.map(function (l, i) {
        return '<tr><th scope="row">' + l + "</th>" + g.cells[i].map(spotsCell).join("") + "</tr>";
      }).join("") +
        '<tr><th scope="row">สำรอง</th>' + g.overflow.map(overCell).join("") + "</tr>";
    }

    return head +
      '<p class="summary"><b>' + data.players.length + "</b> คน · <b>" + g.courts.length + "</b> คอร์ท</p>" +
      '<div class="grid-wrap"><table class="grid"><thead><tr><th></th>' + th + "</tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<p class="legend">' + dot("filled") + " จองแล้ว " + dot("open") + " ว่าง " + dot("filled", true) + " สำรอง</p>";
  }

  function renderUnknown(lines) {
    if (!lines.length) return "";
    return "อ่านไม่ออก " + lines.length + " บรรทัด:<ul>" +
      lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
  }

  var note = document.getElementById("note");
  var card = document.getElementById("card");
  var unknown = document.getElementById("unknown");
  var toggle = document.getElementById("view");
  var save = document.getElementById("save");
  var VIEWS = { time: "Time", court: "Court" };
  var view = "court";
  var timer;
  try { if (VIEWS[localStorage.getItem("pa-view")]) view = localStorage.getItem("pa-view"); } catch (e) {}

  function update() {
    var data = parseNote(note.value);
    toggle.textContent = "View: " + VIEWS[view];
    card.innerHTML = renderCard(data, view);
    save.disabled = !data.courts.length;
    unknown.innerHTML = renderUnknown(data.unknown);
  }

  toggle.addEventListener("click", function () {
    view = view === "time" ? "court" : "time";
    try { localStorage.setItem("pa-view", view); } catch (e) {}
    update();
  });

  function pngName() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, "0"); }
    return "pa-reader-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes()) + ".png";
  }

  // Phones get the share sheet (straight to chat); desktops download the file.
  // If the browser refuses to share (e.g. the click is too long ago), download instead.
  function deliver(blob) {
    var file = new File([blob], pngName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).catch(function (e) {
        if (e.name === "AbortError") return;
        if (e.name === "NotAllowedError") return download(file);
        throw e;
      });
    }
    download(file);
  }

  function download(file) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // html-to-image drops CSS paint on SVG shapes, so inline the computed values while capturing.
  var PAINT = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity"];
  function inlinePaint(on) {
    [].forEach.call(card.querySelectorAll("circle"), function (c) {
      var cs = on && getComputedStyle(c);
      PAINT.forEach(function (k) {
        if (on) c.style.setProperty(k, cs.getPropertyValue(k));
        else c.style.removeProperty(k);
      });
    });
  }

  save.addEventListener("click", function () {
    var label = save.textContent;
    save.disabled = true;
    save.textContent = "กำลังสร้าง…";
    function done(err) {
      card.classList.remove("capture");
      inlinePaint(false);
      save.textContent = label;
      save.disabled = false;
      if (err) { console.error(err); alert("บันทึกรูปไม่สำเร็จ"); }
    }
    if (!window.htmlToImage) return done(new Error("html-to-image not loaded"));
    card.classList.add("capture");
    inlinePaint(true);
    document.fonts.ready
      .then(function () { return htmlToImage.toBlob(card, { pixelRatio: 2 }); })
      .then(function (blob) { card.classList.remove("capture"); inlinePaint(false); return deliver(blob); })
      .then(function () { done(); }, done);
  });
  note.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
  update();

  window.parseNote = parseNote;
  window.buildGrid = buildGrid;
  window.renderCard = renderCard;
})();
