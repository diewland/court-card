// Renders each note in tests/notes/ with docs/app.js and checks the card the page would show.
// Usage: node tests/run.js [case-name ...]
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var APP = fs.readFileSync(path.join(__dirname, "../docs/app.js"), "utf8");

// Expected card per note. Rows are keyed by court number, one value per hour column:
// a number is the count of solid circles, "-" is an hour the court isn't booked.
// reserve is the สำรอง row (null when the row isn't shown).
var CASES = {
  "friday-basic": {
    day: "วันศุกร์", players: 10, hours: ["18:00", "19:00"],
    rows: { 2: [6, 6], 3: [3, 4] }, reserve: null
  },
  "thursday-split-court": {
    day: "วันพฤหัส", players: 11, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [5, "-", 2] }, reserve: ["-", 2, "-"]
  },
  "thursday-pm-suffix": {
    day: "วันพฤหัส", players: 12, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, "-", 3] }, reserve: ["-", 3, "-"]
  },
  "saturday-members-full": {
    day: "วันเสาร์", players: 14, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: [6, 6, 6], 3: [6, 6, 6] }, reserve: ["-", 2, "-"]
  },
  "sunday-court-continuation": {
    day: "วันอาทิตย์", players: 15, hours: ["16:00", "17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6, 6], 3: [6, "-", 6, 4] }, reserve: ["-", 2, 1, "-"]
  },
  "monday-comma-ranges": {
    day: "วันจันทร์", players: 16, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, 6, 6] }, reserve: ["-", 1, "-"]
  },
  "monday-hours-only": {
    day: "วันจันทร์", players: 16, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [5, 6, 6] }, reserve: ["-", 1, "-"]
  },
  "thursday-range-next-line": {
    day: "วันพฤหัส", players: 15, hours: ["17:00", "18:00", "19:00"],
    rows: { 2: ["-", 6, 6], 3: [6, 6, 5] }, reserve: ["-", 1, "-"]
  }
};

function render(note) {
  var els = {};
  var document = {
    getElementById: function (id) {
      return els[id] || (els[id] = { value: note, innerHTML: "", addEventListener: function () {} });
    }
  };
  vm.runInNewContext(APP, { document: document, window: {}, setTimeout: setTimeout, clearTimeout: clearTimeout });
  return { card: els.card.innerHTML, unknown: els.unknown.innerHTML };
}

function all(re, s) {
  var out = [], m;
  re = new RegExp(re.source, "g");
  while ((m = re.exec(s))) out.push(m);
  return out;
}

function cellValues(rowHtml, read) {
  return all(/<td[^>]*>(.*?)<\/td>/, rowHtml).map(function (c) { return c[1] === "–" ? "-" : read(c[1]); });
}

// Read back what the card shows, in the same shape as CASES.
function readCard(html) {
  var rows = {};
  all(/<tr><th scope="row">คอร์ท (\d+)<\/th>(.*?)<\/tr>/, html).forEach(function (m) {
    rows[m[1]] = cellValues(m[2], function (td) { return (td.match(/spot filled/g) || []).length; });
  });
  var reserve = html.match(/<tr class="over"><th scope="row">สำรอง<\/th>(.*?)<\/tr>/);
  var thead = html.match(/<thead>(.*?)<\/thead>/);
  return {
    day: (html.match(/<p class="day">(.*?)<\/p>/) || [])[1],
    players: +(html.match(/<p class="summary"><b>(\d+)<\/b>/) || [])[1],
    hours: thead ? all(/<th>([^<]+)<\/th>/, thead[1]).map(function (m) { return m[1]; }) : [],
    rows: rows,
    reserve: reserve ? cellValues(reserve[1], parseInt) : null
  };
}

var names = process.argv.slice(2);
if (!names.length) names = Object.keys(CASES);
var failed = 0;

names.forEach(function (name) {
  if (!CASES[name]) { console.log("?    " + name + ": no such case"); failed++; return; }
  var out = render(fs.readFileSync(path.join(__dirname, "notes", name + ".txt"), "utf8"));
  var got = readCard(out.card);
  var errors = [];
  if (JSON.stringify(got) !== JSON.stringify(CASES[name])) {
    errors.push("expected " + JSON.stringify(CASES[name]) + "\n       got      " + JSON.stringify(got));
  }
  if (out.unknown) errors.push("unreadable lines: " + out.unknown.replace(/<[^>]+>/g, " ").trim());
  all(/<svg class="spots".*?<\/svg>/, out.card).forEach(function (s, i) {
    var n = (s[0].match(/<circle/g) || []).length;
    if (n !== 6) errors.push("cell " + i + " has " + n + " circles, expected 6");
  });

  if (errors.length) {
    failed++;
    console.log("FAIL " + name + "\n       " + errors.join("\n       "));
  } else {
    console.log("ok   " + name);
  }
});

console.log(failed ? "\n" + failed + " of " + names.length + " failed" : "\nall " + names.length + " passed");
process.exit(failed ? 1 : 0);
