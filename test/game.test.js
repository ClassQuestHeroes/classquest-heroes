const assert = require("node:assert");
const test = require("node:test");
const Game = require("../app/game.js");

function setup() {
  const st = Game.newState("Test");
  ["healer", "warrior", "rogue", "wizard", "healer", "warrior", "rogue", "wizard"].forEach((cls, i) =>
    Game.addStudent(st, { name: "S" + i, cls, pic: "🐶" }));
  Game.drawTeams(st);
  st.students.forEach((s) => Game.tick(st, s.id, "seated"));
  st.questOpen = true;
  return st;
}
const byCls = (st, teamId, cls) => st.students.find((s) => s.teamId === teamId && s.cls === cls);

test("teams get one of each class", () => {
  const st = setup();
  assert.equal(st.teams.length, 2);
  st.teams.forEach((t) => {
    const classes = Game.teamMembers(st, t.id).map((s) => s.cls).sort();
    assert.deepEqual(classes, ["healer", "rogue", "warrior", "wizard"]);
  });
});

test("morning tick gives 1 or 2 points and can be corrected", () => {
  const st = setup();
  const s = st.students[0];
  assert.equal(s.energy, 2);
  Game.tick(st, s.id, "here");
  assert.equal(s.energy, 1);
  Game.tick(st, s.id, "absent");
  assert.equal(s.energy, 0);
});

test("warrior guard blocks a pinch, sneaky pinch gets through", () => {
  const st = setup();
  const [a, b] = st.teams;
  b.gems = 5;
  const rogue = byCls(st, a.id, "rogue");
  const warrior = byCls(st, b.id, "warrior");
  let r = Game.usePower(st, rogue.id, "pinch", b.id);
  assert.ok(r.ok, r.message);
  assert.match(r.message, /guarded/);
  assert.equal(b.gems, 5);
  assert.equal(warrior.energy, 1);
  st.today.gemHits = {};
  warrior.energy = 0;
  r = Game.usePower(st, rogue.id, "pinch", b.id);
  assert.ok(r.ok);
  assert.equal(b.gems, 3);
  assert.equal(a.gems, 2);
});

test("one energy attack per student per day, and healer heals it back", () => {
  const st = setup();
  const [a, b] = st.teams;
  byCls(st, b.id, "warrior").energy = 0;
  const wiz = byCls(st, a.id, "wizard");
  const target = byCls(st, b.id, "rogue");
  assert.ok(Game.usePower(st, wiz.id, "drain", target.id).ok);
  assert.equal(target.energy, 1);
  assert.equal(Game.usePower(st, wiz.id, "drain", target.id).ok, false);
  const healer = byCls(st, b.id, "healer");
  assert.ok(Game.usePower(st, healer.id, "heal", target.id).ok);
  assert.equal(target.energy, 2);
});

test("shield blocks even sneaky trip; cannot target own team", () => {
  const st = setup();
  const [a, b] = st.teams;
  const rogue = byCls(st, a.id, "rogue");
  const target = byCls(st, b.id, "wizard");
  assert.ok(Game.usePower(st, byCls(st, b.id, "warrior").id, "shield", target.id).ok);
  const r = Game.usePower(st, rogue.id, "sneakTrip", target.id);
  assert.match(r.message, /Shield/);
  assert.equal(target.energy, 2);
  assert.equal(Game.usePower(st, rogue.id, "trip", byCls(st, a.id, "wizard").id).ok, false);
});

test("double doubles the next award; bathroom free trips; purse never negative", () => {
  const st = setup();
  const [a, b] = st.teams;
  const target = byCls(st, b.id, "healer");
  assert.ok(Game.usePower(st, byCls(st, a.id, "wizard").id, "double", target.id).ok);
  Game.award(st, target.id, "answer");
  assert.equal(b.gems, 2);
  Game.award(st, target.id, "bathroom");
  Game.award(st, target.id, "bathroom");
  assert.equal(b.gems, 2);
  Game.award(st, target.id, "bathroom");
  assert.equal(b.gems, 1);
  Game.award(st, target.id, "incident");
  assert.equal(b.gems, 0);
});

test("closed quest window and not enough points are refused", () => {
  const st = setup();
  const [a, b] = st.teams;
  const rogue = byCls(st, a.id, "rogue");
  st.questOpen = false;
  assert.equal(Game.usePower(st, rogue.id, "pinch", b.id).ok, false);
  st.questOpen = true;
  rogue.energy = 1;
  assert.equal(Game.usePower(st, rogue.id, "sneakPinch", b.id).ok, false);
});

test("end of week scores teams and resets, healers keep up to 5", () => {
  const st = setup();
  const [a] = st.teams;
  a.gems = 12;
  const healer = byCls(st, a.id, "healer");
  healer.energy = 7;
  const results = Game.endWeek(st);
  assert.equal(results.find((r) => r.teamId === a.id).survived, true);
  assert.equal(healer.energy, 5);
  assert.equal(byCls(st, a.id, "rogue").energy, 0);
  assert.equal(a.gems, 0);
  assert.equal(st.week, 2);
});
