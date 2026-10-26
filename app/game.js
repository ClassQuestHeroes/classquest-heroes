// ClassQuest Heroes game rules. Pure functions over a plain state object, so the
// same rules run in demo mode (saved in the browser) and with Firebase.
(function (root) {
  "use strict";

  var CLASSES = {
    healer: { name: "Healer", icon: "💚", energy: "healing points" },
    warrior: { name: "Warrior", icon: "🛡️", energy: "action points" },
    rogue: { name: "Rogue", icon: "🎭", energy: "action points" },
    wizard: { name: "Wizard", icon: "🔮", energy: "magic points" }
  };
  var CLASS_ORDER = ["healer", "warrior", "rogue", "wizard"];

  // target: "teammate" (incl. self), "team" (own team), "otherStudent", "otherTeam"
  var POWERS = {
    heal: { cls: "healer", name: "Heal", cost: 1, target: "teammate",
      help: "Give back 1 point a teammate lost today, or up to 2 gems your team lost today." },
    groupHeal: { cls: "healer", name: "Group heal", cost: 3, target: "team",
      help: "Give back 1 lost point to every teammate who lost one today." },
    shield: { cls: "warrior", name: "Shield", cost: 1, target: "teammate",
      help: "Protect one teammate from Trips and Drains until the end of the day." },
    fortress: { cls: "warrior", name: "Fortress", cost: 3, target: "team",
      help: "Protect your whole team and its gems until the end of the day." },
    pinch: { cls: "rogue", name: "Pinch", cost: 1, target: "otherTeam", attack: "gems",
      help: "Take 2 gems from another team and add them to yours." },
    trip: { cls: "rogue", name: "Trip", cost: 1, target: "otherStudent", attack: "energy",
      help: "Take 1 point from a student on another team." },
    sneakPinch: { cls: "rogue", name: "Sneaky Pinch", cost: 2, target: "otherTeam", attack: "gems", sneak: true,
      help: "A Pinch that slips past a Warrior's guard (but not a Fortress)." },
    sneakTrip: { cls: "rogue", name: "Sneaky Trip", cost: 2, target: "otherStudent", attack: "energy", sneak: true,
      help: "A Trip that slips past a Warrior's guard (but not a Shield)." },
    double: { cls: "wizard", name: "Double", cost: 2, target: "otherStudent",
      help: "The next gems the teacher gives this student are doubled." },
    drain: { cls: "wizard", name: "Drain", cost: 1, target: "otherStudent", attack: "energy",
      help: "Take 1 point from a student on another team." },
    curse: { cls: "wizard", name: "Gem curse", cost: 2, target: "otherTeam", attack: "gems",
      help: "Another team loses 3 gems." }
  };

  var TEAM_NAMES = ["Dragons", "Phoenixes", "Griffins", "Unicorns", "Krakens", "Owls", "Wolves", "Pegasi"];
  var PICTURES = ["🐶", "🐱", "🦁", "🐸", "🐵", "🐧", "🦄", "🐢", "🐙"];

  var DEFAULT_REASONS = [
    { id: "answer", label: "Answering a question", gems: 1 },
    { id: "behaviour", label: "Great behaviour", gems: 2 },
    { id: "playground", label: "Great playground choice", gems: 2 },
    { id: "interrupt", label: "Interrupting others' learning", gems: -1 },
    { id: "bathroom", label: "Bathroom during learning time", gems: -1, bathroom: true },
    { id: "incident", label: "Playground incident", gems: -3 }
  ];

  var HEALER_SAVE_CAP = 5;
  var SURVIVE_GEMS = 10;
  var BATHROOM_FREE_TRIPS = 2;

  function newState(className) {
    return {
      version: 1,
      className: className || "My class",
      teacherPin: "",
      questOpen: false,
      week: 1,
      students: [],
      teams: [],
      reasons: DEFAULT_REASONS.map(function (r) { return Object.assign({}, r); }),
      today: newDay(todayString()),
      history: [],
      log: []
    };
  }

  function newDay(date) {
    return {
      date: date,
      ticked: {},      // studentId -> "absent" | "here" | "seated" | "excused"
      shields: {},     // studentId -> true
      fortress: {},    // teamId -> true
      protected: {},   // studentId -> true (set by teacher)
      energyHits: {},  // studentId -> true (one Trip/Drain per student per day)
      gemHits: {},     // teamId -> true (one Pinch/Curse per team per day)
      lostEnergy: {},  // studentId -> points lost today
      lostGems: {}     // teamId -> gems lost today
    };
  }

  function todayString(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // Starts a fresh day if the date has changed. Energy is kept; daily effects reset.
  function rollDay(state, date) {
    date = date || todayString();
    if (state.today.date !== date) {
      state.today = newDay(date);
      state.questOpen = false;
    }
    return state;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function student(state, id) {
    return state.students.find(function (s) { return s.id === id; });
  }

  function team(state, id) {
    return state.teams.find(function (t) { return t.id === id; });
  }

  function teamMembers(state, teamId) {
    return state.students.filter(function (s) { return s.teamId === teamId; });
  }

  function addLog(state, text) {
    state.log.unshift({ at: new Date().toISOString(), text: text });
    if (state.log.length > 300) state.log.length = 300;
  }

  function addStudent(state, data) {
    var s = {
      id: uid(),
      name: data.name.trim(),
      hero: (data.hero || "").trim() || data.name.trim(),
      cls: data.cls,
      pic: data.pic,
      energy: 0,
      xp: 0,
      bathroom: 0,
      exempt: false,
      doubled: false,
      teamId: null
    };
    state.students.push(s);
    return s;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Random teams of about 4, dealing each class around in turn so every team
  // gets as close to one of each class as the class list allows.
  function drawTeams(state) {
    var n = state.students.length;
    var count = Math.max(1, Math.round(n / 4));
    var oldGems = {};
    state.teams.forEach(function (t) { oldGems[t.name] = t.gems; });
    var names = shuffle(TEAM_NAMES);
    state.teams = [];
    for (var i = 0; i < count; i++) {
      var name = names[i % names.length] + (i >= names.length ? " " + (i + 1) : "");
      state.teams.push({ id: uid(), name: name, gems: 0, seasonGems: 0 });
    }
    var next = Math.floor(Math.random() * count);
    CLASS_ORDER.forEach(function (cls) {
      shuffle(state.students.filter(function (s) { return s.cls === cls; })).forEach(function (s) {
        s.teamId = state.teams[next % count].id;
        next++;
      });
    });
    addLog(state, "New teams drawn: " + state.teams.map(function (t) { return t.name; }).join(", ") + ".");
    return state.teams;
  }

  // Morning tick. 1 point for being at school, 2 if seated by the end of the song.
  // Excused absences get the base point so the team isn't penalised.
  var TICK_POINTS = { absent: 0, excused: 1, here: 1, seated: 2 };

  function tick(state, studentId, mark) {
    var s = student(state, studentId);
    var before = state.today.ticked[studentId];
    var change = TICK_POINTS[mark] - (before ? TICK_POINTS[before] : 0);
    s.energy = Math.max(0, s.energy + change);
    state.today.ticked[studentId] = mark;
    return change;
  }

  // Teacher gives or takes gems for a reason. Gems go to the student's team purse.
  function award(state, studentId, reasonId) {
    var s = student(state, studentId);
    var reason = state.reasons.find(function (r) { return r.id === reasonId; });
    var t = team(state, s.teamId);
    if (!s || !reason || !t) return { ok: false, message: "Choose a student who is in a team." };
    var gems = reason.gems;
    var note = "";
    if (reason.bathroom) {
      s.bathroom++;
      if (s.exempt || s.bathroom <= BATHROOM_FREE_TRIPS) {
        gems = 0;
        note = s.exempt ? " (exempt)" : " (trip " + s.bathroom + " of " + BATHROOM_FREE_TRIPS + " free)";
      }
    }
    if (gems > 0 && s.doubled) {
      gems *= 2;
      s.doubled = false;
      note += " (doubled by a Wizard!)";
    }
    var before = t.gems;
    t.gems = Math.max(0, t.gems + gems);
    var applied = t.gems - before;
    if (applied > 0) t.seasonGems = (t.seasonGems || 0) + applied;
    var text = s.name + ": " + reason.label + ", " + signed(applied) + " gems for " + t.name + note + ".";
    addLog(state, text);
    return { ok: true, message: text, gems: applied };
  }

  function signed(n) {
    return n > 0 ? "+" + n : String(n);
  }

  // Which targets a student may choose for a power.
  function targetsFor(state, actorId, powerId) {
    var actor = student(state, actorId);
    var p = POWERS[powerId];
    if (p.target === "teammate") return teamMembers(state, actor.teamId);
    if (p.target === "otherStudent") {
      return state.students.filter(function (s) { return s.teamId && s.teamId !== actor.teamId; });
    }
    if (p.target === "otherTeam") {
      return state.teams.filter(function (t) { return t.id !== actor.teamId; });
    }
    return [];
  }

  // Finds a Warrior on the defending team with a spare point to guard automatically.
  function guardFor(state, teamId) {
    return teamMembers(state, teamId).find(function (s) {
      return s.cls === "warrior" && s.energy >= 1;
    });
  }

  // Uses a power. Returns { ok, message }. Only changes state when ok.
  function usePower(state, actorId, powerId, targetId) {
    var actor = student(state, actorId);
    var p = POWERS[powerId];
    if (!state.questOpen) return fail("The quest window is closed right now.");
    if (!actor || !p || p.cls !== actor.cls) return fail("That power isn't yours.");
    if (!actor.teamId) return fail("You need to be in a team first.");
    if (actor.energy < p.cost) return fail("You need " + p.cost + " " + CLASSES[actor.cls].energy + " for " + p.name + ".");

    var myTeam = team(state, actor.teamId);
    var result;

    if (p.target === "teammate" || p.target === "otherStudent") {
      var target = student(state, targetId);
      var allowed = targetsFor(state, actorId, powerId).indexOf(target) !== -1;
      if (!target || !allowed) return fail("Choose someone to use " + p.name + " on.");
      result = applyToStudent(state, actor, p, target, powerId);
    } else if (p.target === "otherTeam") {
      var targetTeam = team(state, targetId);
      if (!targetTeam || targetTeam.id === actor.teamId) return fail("Choose another team.");
      result = applyToTeam(state, actor, p, targetTeam, powerId, myTeam);
    } else {
      result = applyToOwnTeam(state, actor, p, powerId, myTeam);
    }

    if (!result.ok) return result;
    actor.energy -= p.cost;
    addLog(state, result.message);
    return result;

    function fail(message) { return { ok: false, message: message }; }
  }

  function applyToStudent(state, actor, p, target, powerId) {
    var day = state.today;
    var who = actor.hero + " (" + actor.name + ")";
    if (powerId === "heal") {
      if ((day.lostEnergy[target.id] || 0) > 0) {
        target.energy++;
        day.lostEnergy[target.id]--;
        return ok(who + " healed " + target.name + ": +1 point back.");
      }
      var t = team(state, actor.teamId);
      var lost = day.lostGems[t.id] || 0;
      if (lost > 0) {
        var back = Math.min(2, lost);
        t.gems += back;
        day.lostGems[t.id] -= back;
        return ok(who + " healed the " + t.name + " purse: +" + back + " gems back.");
      }
      return { ok: false, message: target.name + " hasn't lost anything today, and your team hasn't lost gems." };
    }
    if (powerId === "shield") {
      if (day.shields[target.id]) return { ok: false, message: target.name + " already has a Shield today." };
      day.shields[target.id] = true;
      return ok(who + " put a Shield on " + target.name + ".");
    }
    if (powerId === "double") {
      if (target.doubled) return { ok: false, message: target.name + " already has a Double waiting." };
      target.doubled = true;
      return ok(who + " cast Double on " + target.name + ". Their next gems are doubled!");
    }
    // Energy attacks: Trip, Sneaky Trip, Drain.
    if (day.protected[target.id]) return { ok: false, message: target.name + " is protected by the teacher today." };
    if (day.energyHits[target.id]) return { ok: false, message: target.name + " has already been hit today. Pick someone else." };
    if (target.energy < 1) return { ok: false, message: target.name + " has no points to take." };
    day.energyHits[target.id] = true;
    var blocked = blockedBy(state, target.teamId, target.id, p.sneak);
    if (blocked) return ok(who + " used " + p.name + " on " + target.name + ", but " + blocked);
    target.energy--;
    day.lostEnergy[target.id] = (day.lostEnergy[target.id] || 0) + 1;
    return ok(who + " used " + p.name + " on " + target.name + ": -1 point.");
  }

  function applyToTeam(state, actor, p, targetTeam, powerId, myTeam) {
    var day = state.today;
    var who = actor.hero + " (" + actor.name + ")";
    if (day.gemHits[targetTeam.id]) return { ok: false, message: "The " + targetTeam.name + " have already been hit today. Pick another team." };
    if (targetTeam.gems < 1) return { ok: false, message: "The " + targetTeam.name + " have no gems to take." };
    day.gemHits[targetTeam.id] = true;
    var blocked = blockedBy(state, targetTeam.id, null, p.sneak);
    if (blocked) return ok(who + " used " + p.name + " on the " + targetTeam.name + ", but " + blocked);
    var amount = Math.min(powerId === "curse" ? 3 : 2, targetTeam.gems);
    targetTeam.gems -= amount;
    day.lostGems[targetTeam.id] = (day.lostGems[targetTeam.id] || 0) + amount;
    if (powerId === "curse") return ok(who + " cast Gem curse on the " + targetTeam.name + ": -" + amount + " gems.");
    myTeam.gems += amount;
    return ok(who + " pinched " + amount + " gems from the " + targetTeam.name + " for the " + myTeam.name + "!");
  }

  function applyToOwnTeam(state, actor, p, powerId, myTeam) {
    var day = state.today;
    var who = actor.hero + " (" + actor.name + ")";
    if (powerId === "fortress") {
      if (day.fortress[myTeam.id]) return { ok: false, message: "Your team already has a Fortress today." };
      day.fortress[myTeam.id] = true;
      return ok(who + " raised a Fortress around the " + myTeam.name + "!");
    }
    if (powerId === "groupHeal") {
      var healed = teamMembers(state, myTeam.id).filter(function (s) {
        return (day.lostEnergy[s.id] || 0) > 0;
      });
      if (!healed.length) return { ok: false, message: "Nobody in your team has lost a point today." };
      healed.forEach(function (s) { s.energy++; day.lostEnergy[s.id]--; });
      return ok(who + " used Group heal: " + healed.map(function (s) { return s.name; }).join(", ") + " got a point back.");
    }
    return { ok: false, message: "Unknown power." };
  }

  // Returns a sentence ending if the attack is blocked, or "" if it lands.
  // Shields and Fortresses always block. A Warrior's automatic guard blocks
  // unless the attack is sneaky, and uses one of the Warrior's points.
  function blockedBy(state, teamId, studentId, sneak) {
    var day = state.today;
    if (day.fortress[teamId]) return "a Fortress blocked it!";
    if (studentId && day.shields[studentId]) return "a Shield blocked it!";
    if (sneak) return "";
    var guard = guardFor(state, teamId);
    if (guard) {
      guard.energy--;
      return guard.name + " the Warrior guarded and blocked it!";
    }
    return "";
  }

  function ok(message) { return { ok: true, message: message }; }

  // A team gets through the week if everyone still has a point and the purse holds enough gems.
  function weekResults(state) {
    return state.teams.map(function (t) {
      var members = teamMembers(state, t.id);
      var everyoneUp = members.every(function (s) { return s.energy >= 1; });
      return {
        teamId: t.id,
        name: t.name,
        gems: t.gems,
        everyoneUp: everyoneUp,
        survived: everyoneUp && t.gems >= SURVIVE_GEMS
      };
    }).sort(function (a, b) { return b.gems - a.gems; });
  }

  // Friday: record results, reset purses and energy (Healers keep up to 5 saved).
  function endWeek(state) {
    var results = weekResults(state);
    state.history.unshift({ week: state.week, endedAt: new Date().toISOString(), results: results });
    state.students.forEach(function (s) {
      s.energy = s.cls === "healer" ? Math.min(s.energy, HEALER_SAVE_CAP) : 0;
      s.bathroom = 0;
      s.doubled = false;
    });
    state.teams.forEach(function (t) { t.gems = 0; });
    addLog(state, "Week " + state.week + " finished. " +
      results.filter(function (r) { return r.survived; }).length + " of " + results.length + " teams made it through.");
    state.week++;
    state.today = newDay(todayString());
    state.questOpen = false;
    return results;
  }

  var Game = {
    CLASSES: CLASSES,
    CLASS_ORDER: CLASS_ORDER,
    POWERS: POWERS,
    PICTURES: PICTURES,
    SURVIVE_GEMS: SURVIVE_GEMS,
    HEALER_SAVE_CAP: HEALER_SAVE_CAP,
    newState: newState,
    rollDay: rollDay,
    todayString: todayString,
    addStudent: addStudent,
    drawTeams: drawTeams,
    tick: tick,
    award: award,
    targetsFor: targetsFor,
    usePower: usePower,
    weekResults: weekResults,
    endWeek: endWeek,
    student: student,
    team: team,
    teamMembers: teamMembers,
    addLog: addLog,
    uid: uid
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Game;
  else root.Game = Game;
})(this);
