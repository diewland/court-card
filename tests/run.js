// Renders each note in tests/notes/ with docs/app.js and checks the card the page would show.
// Usage: node tests/run.js [case-name ...]
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var APP = fs.readFileSync(path.join(__dirname, "../docs/app.js"), "utf8");

// Expected card per note. Rows are keyed by court number, one value per hour column:
// a number is the count of solid circles, "-" is an hour the court isn't booked.
// reserve is the สำรอง row: people shown per hour (solid circles plus the +N badge).
var CASES = {
  "friday-basic": {
    day: "วันศุกร์", players: 10, hours: ["18:00", "19:00"],
    rows: { 2: [6, 6], 3: [3, 4] }, reserve: [0, 0]
  },
  "friday-preamble": {
    day: "วันศุกร์", players: 10, hours: ["18:00", "19:00"],
    rows: { 2: [6, 6], 3: [3, 4] }, reserve: [0, 0]
  },
  "thursday-split-court": {
    day: "วันพฤหัส", players: 11, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [5, "-", 2] }, reserve: [0, 2, 0]
  },
  "thursday-pm-suffix": {
    day: "วันพฤหัส", players: 12, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, "-", 3] }, reserve: [0, 3, 0]
  },
  "saturday-members-full": {
    day: "วันเสาร์", players: 14, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: [6, 6, 6], 3: [6, 6, 6] }, reserve: [0, 2, 0]
  },
  "sunday-court-continuation": {
    day: "วันอาทิตย์", players: 15, hours: ["16:00", "17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6, 6], 3: [6, "-", 6, 4] }, reserve: [0, 2, 1, 0]
  },
  "monday-comma-ranges": {
    day: "วันจันทร์", players: 16, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, 6, 6] }, reserve: [0, 1, 0]
  },
  "monday-hours-only": {
    day: "วันจันทร์", players: 16, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [5, 6, 6] }, reserve: [0, 1, 0]
  },
  // Bare start hour with minutes only on the end ("18-20.00"), and the reverse ("18.00-20").
  "wednesday-mixed-ranges": {
    day: "วันพุธ", players: 8, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [2, 0, 0] }, reserve: [0, 0, 0]
  },
  "friday-thai-to": {
    day: "วันศุกร์", players: 11, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [4, 4, 3] }, reserve: [0, 0, 0]
  },
  "thursday-range-next-line": {
    day: "วันพฤหัส", players: 15, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, 6, 5] }, reserve: [0, 1, 0]
  },
  "tuesday-reserve-cap": {
    day: "วันอังคาร", players: 14, hours: ["18:00"],
    rows: { 2: [6] }, reserve: [8]
  },
  "thursday-cancelled-slot": {
    day: "วันพฤหัส", players: 13, hours: ["18:00", "19:00"],
    rows: { 2: [6, 6], 3: ["-", 6], 4: [6, "-"] }, reserve: [0, 0]
  },
  // Court 2 cancelled at 19:00: its 6 players fill court 3 (which had 2), and 2 go to สำรอง.
  "thursday-split-court-cancel": {
    note: "thursday-split-court", cancel: { "2@19": true },
    day: "วันพฤหัส", players: 11, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 0], 3: [5, "-", 6] }, reserve: [0, 2, 2]
  },
  // Court 3 cancelled at 19:00: court 4 isn't booked then, so 6 go to สำรอง (4 circles + 2).
  "thursday-cancelled-slot-cancel": {
    note: "thursday-cancelled-slot", cancel: { "3@19": true },
    day: "วันพฤหัส", players: 13, hours: ["18:00", "19:00"],
    rows: { 2: [6, 6], 3: ["-", 0], 4: [6, "-"] }, reserve: [0, 6]
  }
};

function render(note) {
  var els = {};
  var document = {
    getElementById: function (id) {
      return els[id] || (els[id] = { value: note, innerHTML: "", addEventListener: function () {} });
    }
  };
  var window = {};
  vm.runInNewContext(APP, { document: document, window: window, setTimeout: setTimeout, clearTimeout: clearTimeout });
  return {
    card: window.renderCard(window.parseNote(note), "time"),
    courtCard: els.card.innerHTML,
    unknown: els.unknown.innerHTML,
    window: window,
    data: window.parseNote(note)
  };
}

function all(re, s) {
  var out = [], m;
  re = new RegExp(re.source, "g");
  while ((m = re.exec(s))) out.push(m);
  return out;
}

function solid(td) { return (td.match(/spot filled/g) || []).length; }
// People a สำรอง cell shows: solid circles plus the +N badge.
function shown(td) { return solid(td) + +((td.match(/class="more">\+(\d+)/) || [])[1] || 0); }

function cellValues(rowHtml, read) {
  return all(/<td[^>]*>(.*?)<\/td>/, rowHtml).map(function (c) { return c[1] === "–" ? "-" : read(c[1]); });
}

// Read back what the card shows, in the same shape as CASES.
function readCard(html) {
  var rows = {};
  all(/<tr><th scope="row">คอร์ท (\d+)<\/th>(.*?)<\/tr>/, html).forEach(function (m) {
    rows[m[1]] = cellValues(m[2], solid);
  });
  var reserve = html.match(/<tr><th scope="row">สำรอง<\/th>(.*?)<\/tr>/);
  var thead = html.match(/<thead>(.*?)<\/thead>/);
  return {
    day: (html.match(/<p class="day">ลงชื่อสมาชิกเล่น (.*?)<\/p>/) || [])[1],
    players: +(html.match(/<p class="summary"><b>(\d+)<\/b>/) || [])[1],
    hours: thead ? all(/<th>([^<]+)<\/th>/, thead[1]).map(function (m) { return m[1]; }) : [],
    rows: rows,
    reserve: reserve ? cellValues(reserve[1], shown) : null
  };
}

// Read back the court view (one column per court, one row per hour) in the same shape as CASES.
function readCourtCard(html) {
  var thead = html.match(/<thead>(.*?)<\/thead>/);
  var cols = thead ? all(/<th>([^<]+)<\/th>/, thead[1]).map(function (m) { return m[1]; }) : [];
  var hours = [], rows = {}, reserve = cols[cols.length - 1] === "สำรอง" ? [] : null;
  cols.forEach(function (c) { var m = c.match(/^คอร์ท (\d+)$/); if (m) rows[m[1]] = []; });
  all(/<tr><th scope="row">(\d\d:\d\d)<\/th>(.*?)<\/tr>/, html).forEach(function (m) {
    hours.push(m[1]);
    all(/<td[^>]*>(.*?)<\/td>/, m[2]).forEach(function (td, i) {
      var court = (cols[i].match(/^คอร์ท (\d+)$/) || [])[1];
      var v = td[1] === "–" ? "-" : (court ? solid : shown)(td[1]);
      if (court) rows[court].push(v);
      else reserve.push(v);
    });
  });
  return { hours: hours, rows: rows, reserve: reserve };
}

var names = process.argv.slice(2);
if (!names.length) names = Object.keys(CASES);
var failed = 0;

names.forEach(function (name) {
  if (!CASES[name]) { console.log("?    " + name + ": no such case"); failed++; return; }
  var exp = CASES[name];
  var out = render(fs.readFileSync(path.join(__dirname, "notes", (exp.note || name) + ".txt"), "utf8"));
  // A case with "cancel" renders its note with those court cells cancelled.
  if (exp.cancel) {
    out.card = out.window.renderCard(out.data, "time", exp.cancel);
    out.courtCard = out.window.renderCard(out.data, "court", exp.cancel);
  }
  var want = { day: exp.day, players: exp.players, hours: exp.hours, rows: exp.rows, reserve: exp.reserve };
  var got = readCard(out.card);
  var errors = [];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    errors.push("expected " + JSON.stringify(want) + "\n       got      " + JSON.stringify(got));
  }
  var courtWant = { hours: exp.hours, rows: exp.rows, reserve: exp.reserve };
  var courtGot = readCourtCard(out.courtCard);
  if (JSON.stringify(courtGot) !== JSON.stringify(courtWant)) {
    errors.push("court view: expected " + JSON.stringify(courtWant) + "\n       got      " + JSON.stringify(courtGot));
  }
  if (out.unknown) errors.push("unreadable lines: " + out.unknown.replace(/<[^>]+>/g, " ").trim());
  all(/<svg class="spots[^"]*".*?<\/svg>/, out.card + out.courtCard).forEach(function (s, i) {
    var n = (s[0].match(/<circle/g) || []).length;
    var want = / reserve"/.test(s[0]) ? 4 : 6;
    if (n !== want) errors.push("cell " + i + " has " + n + " circles, expected " + want);
  });

  // Cancelling the first booked cell (on cases without their own "cancel"): that cell drops
  // to 0 under a red X, and every hour still places the same number of players.
  if (!exp.cancel) {
    var first = (out.card.match(/data-cell="([^"]+)"/) || [])[1];
    if (!first) errors.push("no tappable court cell");
    var c = {}; c[first] = true;
    var cut = out.window.renderCard(out.data, "time", c), cutCourt = out.window.renderCard(out.data, "court", c);
    [cut, cutCourt].forEach(function (html) {
      var tds = all(/<td data-cell="([^"]+)"[^>]*class="cancelled"[^>]*>(.*?)<\/td>/, html);
      if (tds.length !== 1 || tds[0][1] !== first || !/<svg class="cross"/.test(tds[0][2]) || solid(tds[0][2])) {
        errors.push("expected exactly " + first + " cancelled, empty, with a red X");
      }
      if (!/class="mini"/.test(html)) errors.push("legend has no cancelled swatch");
    });
    var before = out.window.buildGrid(out.data), after = out.window.buildGrid(out.data, c);
    function placed(g, j) { return g.cells.reduce(function (n, row) { return n + (row[j] || 0); }, g.overflow[j]); }
    before.hours.forEach(function (h, j) {
      if (placed(before, j) !== placed(after, j)) errors.push("cancelling " + first + " lost players at " + h + ":00");
    });
    if (/class="mini"/.test(out.card + out.courtCard)) errors.push("cancelled swatch shown with nothing cancelled");
  }
  if (/class="off"[^>]*data-cell|data-cell[^>]*class="off"/.test(out.card + out.courtCard)) errors.push("unbooked cell is tappable");

  if (errors.length) {
    failed++;
    console.log("FAIL " + name + "\n       " + errors.join("\n       "));
  } else {
    console.log("ok   " + name);
  }
});

console.log(failed ? "\n" + failed + " of " + names.length + " failed" : "\nall " + names.length + " passed");
process.exit(failed ? 1 : 0);
