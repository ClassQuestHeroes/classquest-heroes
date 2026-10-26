// ClassQuest Heroes screens. Each view is a function that returns HTML; clicks are
// handled in one place through data-action attributes.
(function () {
  "use strict";

  var G = window.Game;
  var state = null;
  var view = "board";
  var studentMode = false;
  // Student turn flow: pick hero -> picture password -> power -> target -> result.
  var turn = {};
  var gemsFor = null;
  var saveTimer = null;
  var el = document.getElementById("view");

  // ---------- helpers ----------

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(text) {
    var t = document.getElementById("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      Store.save(state).catch(function () { toast("Couldn't save. Check the internet connection."); });
    }, 300);
  }

  function changed() {
    save();
    render();
  }

  function dots(n) {
    var shown = Math.min(n, 8);
    return "●".repeat(shown) + (n > 8 ? " +" + (n - 8) : "") || "○";
  }

  function clsLabel(s) {
    var c = G.CLASSES[s.cls];
    return '<span class="cls-' + s.cls + '">' + c.name + "</span>";
  }

  function heroLine(s) {
    return '<div class="who"><span class="icon">' + G.CLASSES[s.cls].icon + "</span><div>" +
      "<strong>" + esc(s.hero) + "</strong><small>" + esc(s.name) + " · " + clsLabel(s) + "</small></div></div>";
  }

  function sortedStudents() {
    return state.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // ---------- views ----------

  var views = {};

  views.login = function () {
    return '<div class="card" style="max-width:440px;margin:40px auto">' +
      "<h1>Teacher login</h1>" +
      '<form id="login-form" class="form-grid" style="grid-template-columns:1fr">' +
      '<label>Email<input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>' +
      '<div class="row"><button class="btn" type="submit">Log in</button>' +
      '<button class="btn ghost" type="button" data-action="signup">Create account</button>' +
      '<button class="btn light" type="button" data-action="reset-password">Forgot password</button></div>' +
      "</form></div>";
  };

  views.board = function () {
    if (!state.teams.length) {
      return '<div class="card"><h2>Welcome to ClassQuest Heroes!</h2>' +
        "<p>Start in <strong>Setup</strong>: add your students, then draw teams.</p>" +
        '<button class="btn" data-action="go" data-view="setup">Go to Setup</button></div>';
    }
    var html = "<div class=\"spread\"><h1>" + esc(state.className) + "</h1><p class=\"muted\">Week " + state.week +
      " · a team needs " + G.SURVIVE_GEMS + " gems and everyone on at least 1 point by Friday</p></div><div class=\"grid\">";
    state.teams.slice().sort(function (a, b) { return b.gems - a.gems; }).forEach(function (t) {
      html += '<div class="card"><div class="team-head"><span class="team-name">' + esc(t.name) + '</span><span class="gems">💎 ' + t.gems + "</span></div>";
      var day = state.today;
      if (day.fortress[t.id]) html += '<p class="muted">🏰 Fortress up today</p>';
      G.teamMembers(state, t.id).forEach(function (s) {
        var tags = (day.shields[s.id] ? " 🛡️" : "") + (s.doubled ? " ✨" : "") + (day.protected[s.id] ? " ⭐" : "");
        html += '<div class="member">' + heroLine(s) + '<span class="dots cls-' + s.cls + '" title="' + s.energy + " " +
          G.CLASSES[s.cls].energy + '">' + dots(s.energy) + tags + "</span></div>";
      });
      html += "</div>";
    });
    return html + "</div>";
  };

  views.morning = function () {
    var marks = [["absent", "Away"], ["excused", "Excused"], ["here", "Here"], ["seated", "Seated by end of song"]];
    var done = Object.keys(state.today.ticked).length;
    var html = '<div class="card"><div class="spread"><h2>Morning check-in</h2><span class="muted">' + done + " of " +
      state.students.length + ' done</span></div><p class="muted">Here = 1 point. Seated by the end of the song = 2 points. ' +
      "Excused absence = 1 point so the team isn't penalised.</p>" +
      '<div class="row" style="margin-bottom:8px"><button class="btn ghost small" data-action="all-seated">Mark everyone not done as seated</button></div>';
    sortedStudents().forEach(function (s) {
      var current = state.today.ticked[s.id];
      html += '<div class="tick-row">' + heroLine(s) + '<div class="seg">';
      marks.forEach(function (m) {
        html += '<button class="' + (current === m[0] ? "on" : "") + '" data-action="tick" data-id="' + s.id + '" data-mark="' + m[0] + '">' + m[1] + "</button>";
      });
      html += "</div></div>";
    });
    return html + "</div>";
  };

  views.gems = function () {
    var html = "";
    if (gemsFor) {
      var s = G.student(state, gemsFor);
      var t = G.team(state, s.teamId);
      html += '<div class="card"><div class="spread">' + heroLine(s) + '<span class="gems">' + (t ? esc(t.name) + " 💎 " + t.gems : "No team") + "</span></div>";
      html += '<p class="muted">Bathroom trips this week: ' + s.bathroom + (s.exempt ? " (exempt)" : "") + (s.doubled ? " · ✨ next gems doubled" : "") + "</p>";
      html += '<div class="tiles">';
      state.reasons.forEach(function (r) {
        html += '<button class="tile" data-action="award" data-reason="' + r.id + '"><span class="icon">' + (r.gems > 0 ? "💎" : "⚠️") + "</span>" +
          esc(r.label) + '<br><span class="' + (r.gems > 0 ? "cls-healer" : "cls-rogue") + '">' + (r.gems > 0 ? "+" : "") + r.gems + "</span></button>";
      });
      html += '</div><div class="row" style="margin-top:14px">' +
        '<button class="btn ghost" data-action="gems-back">Back to all students</button>' +
        '<button class="btn light" data-action="toggle-exempt">' + (s.exempt ? "Remove bathroom exemption" : "Bathroom exemption (medical)") + "</button>" +
        '<button class="btn light" data-action="toggle-protect">' + (state.today.protected[s.id] ? "Unprotect today" : "Protect from attacks today") + "</button>" +
        "</div></div>";
      return html;
    }
    html += '<div class="card"><h2>Give or take gems</h2><p class="muted">Tap a student. Gems go to their team.</p><div class="tiles">';
    sortedStudents().forEach(function (s) {
      var t = G.team(state, s.teamId);
      html += '<button class="tile" data-action="gems-pick" data-id="' + s.id + '"><span class="icon">' + G.CLASSES[s.cls].icon + "</span>" +
        esc(s.name) + '<br><small class="muted">' + (t ? esc(t.name) : "No team") + "</small></button>";
    });
    return html + "</div></div>";
  };

  views.quest = function () {
    if (!state.questOpen) {
      return '<div class="card" style="text-align:center"><h1>The quest window is closed</h1>' +
        '<p class="muted">Your teacher will open it soon.</p></div>';
    }
    var s = turn.studentId && G.student(state, turn.studentId);

    if (turn.result) {
      return '<div class="result ' + (turn.result.ok ? "ok" : "bad") + '">' + esc(turn.result.message) + "</div>" +
        '<div class="row" style="justify-content:center"><button class="btn" data-action="turn-done">Done</button></div>';
    }

    if (!s) {
      var html = '<h1>Who are you?</h1><div class="tiles">';
      sortedStudents().filter(function (x) { return x.teamId; }).forEach(function (x) {
        html += '<button class="tile" data-action="turn-who" data-id="' + x.id + '"><span class="icon">' + G.CLASSES[x.cls].icon + "</span>" +
          esc(x.hero) + '<br><small class="muted">' + esc(x.name) + "</small></button>";
      });
      return html + "</div>";
    }

    if (!turn.unlocked) {
      var pics = '<h1>Hi ' + esc(s.name) + '! Tap your secret picture.</h1><div class="tiles">';
      G.PICTURES.forEach(function (p) {
        pics += '<button class="tile pic" data-action="turn-pic" data-pic="' + p + '">' + p + "</button>";
      });
      return pics + '</div><p style="margin-top:16px"><button class="btn ghost" data-action="turn-done">That\'s not me</button></p>';
    }

    var cls = G.CLASSES[s.cls];
    if (!turn.power) {
      var out = '<div class="spread"><h1>' + cls.icon + " " + esc(s.hero) + '</h1><span class="dots cls-' + s.cls + '" style="font-size:22px">' +
        s.energy + " " + cls.energy + "</span></div>";
      Object.keys(G.POWERS).forEach(function (id) {
        var p = G.POWERS[id];
        if (p.cls !== s.cls) return;
        out += '<button class="power" data-action="turn-power" data-power="' + id + '"' + (s.energy < p.cost ? " disabled" : "") + ">" +
          '<span class="cost">' + p.cost + "</span><strong>" + esc(p.name) + "</strong><br>" + esc(p.help) + "</button>";
      });
      return out + '<div class="row"><button class="btn ghost" data-action="turn-done">Save my points for later</button></div>';
    }

    var power = G.POWERS[turn.power];
    if (power.target === "team") {
      return '<h1>' + esc(power.name) + "?</h1><p>" + esc(power.help) + "</p>" +
        '<div class="row"><button class="btn" data-action="turn-target" data-id="">Yes, do it!</button>' +
        '<button class="btn ghost" data-action="turn-back">Back</button></div>';
    }
    var targets = G.targetsFor(state, s.id, turn.power);
    var list = '<h1>' + esc(power.name) + ": who?</h1><div class=\"tiles\">";
    targets.forEach(function (t) {
      var isTeam = power.target === "otherTeam";
      list += '<button class="tile" data-action="turn-target" data-id="' + t.id + '">' +
        (isTeam ? '<span class="icon">🏳️</span>' + esc(t.name) + '<br><span class="gems" style="font-size:16px">💎 ' + t.gems + "</span>"
          : '<span class="icon">' + G.CLASSES[t.cls].icon + "</span>" + esc(t.hero) + '<br><small class="muted">' + esc(t.name) + "</small>") +
        "</button>";
    });
    return list + '</div><p style="margin-top:16px"><button class="btn ghost" data-action="turn-back">Back</button></p>';
  };

  views.week = function () {
    var results = G.weekResults(state);
    var html = '<div class="card"><h2>Week ' + state.week + " so far</h2>" +
      "<table><thead><tr><th>Team</th><th>Gems</th><th>Everyone on 1+ point</th><th>Through the week?</th></tr></thead><tbody>";
    results.forEach(function (r) {
      html += "<tr><td><strong>" + esc(r.name) + "</strong></td><td>💎 " + r.gems + "</td><td>" + (r.everyoneUp ? "Yes" : "Not yet") +
        "</td><td>" + (r.survived ? "🎉 Yes" : "Not yet") + "</td></tr>";
    });
    html += "</tbody></table>" +
      '<p class="muted" style="margin-top:12px">Ending the week saves these results, empties the team purses and resets points. ' +
      "Healers keep up to " + G.HEALER_SAVE_CAP + " saved healing points.</p>" +
      '<button class="btn danger" data-action="end-week">End week ' + state.week + "</button></div>";
    if (state.history.length) {
      html += '<div class="card"><h2>Past weeks</h2>';
      state.history.slice(0, 10).forEach(function (h) {
        html += "<p><strong>Week " + h.week + ":</strong> " + h.results.map(function (r) {
          return esc(r.name) + " 💎" + r.gems + (r.survived ? " 🎉" : "");
        }).join(" · ") + "</p>";
      });
      html += "</div>";
    }
    return html;
  };

  views.setup = function () {
    var html = "";
    if (Store.mode === "demo") {
      html += '<div class="demo-note"><strong>Demo mode:</strong> everything is saved in this browser only. ' +
        'Try it out with made-up names. <button class="btn small ghost" data-action="demo-class">Fill with a demo class</button></div>';
    }
    html += '<div class="card"><h2>Class</h2><div class="form-grid">' +
      '<label>Class name<input id="class-name" value="' + esc(state.className) + '"></label>' +
      '<label>Teacher PIN (to leave student turns)<input id="teacher-pin" inputmode="numeric" maxlength="6" value="' + esc(state.teacherPin) + '"></label>' +
      '<button class="btn" data-action="save-class">Save</button></div></div>';

    html += '<div class="card"><h2>Add a student</h2><p class="muted">First name only, please. The secret picture is how they unlock their turn.</p>' +
      '<form id="add-student" class="form-grid">' +
      '<label>First name<input name="name" required maxlength="20"></label>' +
      '<label>Hero name<input name="hero" maxlength="24" placeholder="e.g. Captain Sparkle"></label>' +
      '<label>Class<select name="cls">' + G.CLASS_ORDER.map(function (c) {
        return '<option value="' + c + '">' + G.CLASSES[c].icon + " " + G.CLASSES[c].name + "</option>";
      }).join("") + "</select></label>" +
      '<label>Secret picture<select name="pic">' + G.PICTURES.map(function (p) { return "<option>" + p + "</option>"; }).join("") + "</select></label>" +
      '<button class="btn" type="submit">Add</button></form></div>';

    var counts = G.CLASS_ORDER.map(function (c) {
      return G.CLASSES[c].icon + " " + state.students.filter(function (s) { return s.cls === c; }).length;
    }).join("  ");
    html += '<div class="card"><div class="spread"><h2>Students (' + state.students.length + ")</h2><span>" + counts + "</span></div>" +
      "<table><thead><tr><th>Name</th><th>Hero</th><th>Class</th><th>Picture</th><th>Team</th><th></th></tr></thead><tbody>";
    sortedStudents().forEach(function (s) {
      var t = G.team(state, s.teamId);
      html += "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.hero) + "</td><td>" + clsLabel(s) + "</td><td>" + s.pic +
        "</td><td>" + (t ? esc(t.name) : "-") + '</td><td><button class="btn small light" data-action="remove-student" data-id="' + s.id + '">Remove</button></td></tr>';
    });
    html += '</tbody></table><div class="row" style="margin-top:14px"><button class="btn" data-action="draw-teams"' +
      (state.students.length < 2 ? " disabled" : "") + ">" + (state.teams.length ? "Redraw teams" : "Draw teams") + "</button>" +
      '<span class="muted">Random teams of about 4, mixing the classes as evenly as possible.</span></div></div>';

    html += '<div class="card"><h2>Gem reasons</h2><div class="form-grid">';
    state.reasons.forEach(function (r) {
      html += "<label>" + esc(r.label) + '<input type="number" min="-10" max="10" data-reason-gems="' + r.id + '" value="' + r.gems + '"></label>';
    });
    html += '<button class="btn" data-action="save-reasons">Save amounts</button></div></div>';

    html += '<div class="card"><h2>Backup</h2><div class="row">' +
      '<button class="btn ghost" data-action="export">Download a backup</button>' +
      '<label class="btn ghost">Restore a backup<input type="file" id="import-file" accept="application/json" hidden></label>' +
      (Store.mode === "firebase" ? '<button class="btn light" data-action="logout">Log out</button>' : "") +
      '<button class="btn danger" data-action="wipe">Delete this class</button></div></div>';
    return html;
  };

  views.log = function () {
    var html = '<div class="card"><h2>What happened</h2><ul class="log">';
    state.log.slice(0, 150).forEach(function (l) {
      var d = new Date(l.at);
      html += "<li><time>" + d.toLocaleDateString("en-AU", { weekday: "short" }) + " " +
        d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) + "</time>" + esc(l.text) + "</li>";
    });
    return html + "</ul></div>";
  };

  // ---------- render ----------

  function render() {
    var nav = document.getElementById("nav");
    var toggle = document.getElementById("quest-toggle");
    var badge = document.getElementById("quest-badge");
    if (!state) {
      nav.hidden = true;
      toggle.hidden = true;
      badge.hidden = true;
      el.innerHTML = views.login();
      return;
    }
    G.rollDay(state);
    nav.hidden = studentMode;
    toggle.hidden = false;
    badge.hidden = false;
    badge.textContent = state.questOpen ? "Quest window open" : "Quest window closed";
    toggle.textContent = studentMode ? "Teacher" : (state.questOpen ? "Close quest window" : "Open quest window");
    toggle.dataset.action = studentMode ? "leave-student-mode" : "toggle-quest";
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function (b) {
      b.classList.toggle("active", b.dataset.view === view);
    });
    el.innerHTML = views[studentMode ? "quest" : view]();
  }

  // ---------- actions ----------

  var actions = {
    go: function (d) { view = d.view; gemsFor = null; render(); },
    "toggle-quest": function () {
      state.questOpen = !state.questOpen;
      G.addLog(state, state.questOpen ? "Quest window opened." : "Quest window closed.");
      changed();
    },
    "leave-student-mode": function () {
      if (state.teacherPin && window.prompt("Teacher PIN") !== state.teacherPin) return toast("That PIN isn't right.");
      studentMode = false;
      turn = {};
      view = "board";
      render();
    },
    tick: function (d) { G.tick(state, d.id, d.mark); changed(); },
    "all-seated": function () {
      state.students.forEach(function (s) { if (!state.today.ticked[s.id]) G.tick(state, s.id, "seated"); });
      changed();
    },
    "gems-pick": function (d) { gemsFor = d.id; render(); },
    "gems-back": function () { gemsFor = null; render(); },
    award: function (d) {
      var r = G.award(state, gemsFor, d.reason);
      toast(r.message);
      changed();
    },
    "toggle-exempt": function () {
      var s = G.student(state, gemsFor);
      s.exempt = !s.exempt;
      changed();
    },
    "toggle-protect": function () {
      var p = state.today.protected;
      if (p[gemsFor]) delete p[gemsFor]; else p[gemsFor] = true;
      changed();
    },
    "turn-who": function (d) { turn = { studentId: d.id }; render(); },
    "turn-pic": function (d) {
      var s = G.student(state, turn.studentId);
      if (d.pic === s.pic) { turn.unlocked = true; render(); }
      else { toast("Not quite! Try again."); turn = {}; render(); }
    },
    "turn-power": function (d) { turn.power = d.power; render(); },
    "turn-back": function () { turn.power = null; render(); },
    "turn-target": function (d) {
      turn.result = G.usePower(state, turn.studentId, turn.power, d.id);
      changed();
    },
    "turn-done": function () { turn = {}; render(); },
    "save-class": function () {
      state.className = document.getElementById("class-name").value.trim() || "My class";
      state.teacherPin = document.getElementById("teacher-pin").value.trim();
      toast("Saved.");
      changed();
    },
    "remove-student": function (d) {
      var s = G.student(state, d.id);
      if (!window.confirm("Remove " + s.name + "?")) return;
      state.students = state.students.filter(function (x) { return x.id !== d.id; });
      changed();
    },
    "draw-teams": function () {
      if (state.teams.length && !window.confirm("Draw brand new teams? Current team gems will be cleared.")) return;
      G.drawTeams(state);
      changed();
    },
    "save-reasons": function () {
      Array.prototype.forEach.call(document.querySelectorAll("[data-reason-gems]"), function (input) {
        var r = state.reasons.find(function (x) { return x.id === input.dataset.reasonGems; });
        r.gems = Math.max(-10, Math.min(10, parseInt(input.value, 10) || 0));
      });
      toast("Gem amounts saved.");
      changed();
    },
    "end-week": function () {
      if (!window.confirm("End week " + state.week + "? Purses empty and points reset.")) return;
      G.endWeek(state);
      changed();
    },
    "demo-class": function () {
      if (state.students.length && !window.confirm("Replace your students with a demo class?")) return;
      var fresh = G.newState("Demo class");
      var names = ["Ava", "Leo", "Mia", "Noah", "Zara", "Eli", "Isla", "Max", "Ruby", "Sam", "Lily", "Jack"];
      var heroes = ["Sunbeam", "Iron Leo", "Moonwhisper", "Thunderpaw", "Starfire", "Shadowfox", "Sparkleaf", "Rocket Max", "Ruby Blaze", "Sir Sam", "Lily Frost", "Jumping Jack"];
      names.forEach(function (n, i) {
        G.addStudent(fresh, { name: n, hero: heroes[i], cls: G.CLASS_ORDER[i % 4], pic: G.PICTURES[i % G.PICTURES.length] });
      });
      G.drawTeams(fresh);
      state = fresh;
      changed();
    },
    export: function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "classquest-heroes-backup-" + G.todayString() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },
    wipe: function () {
      if (window.prompt('This deletes every student and team. Type DELETE to confirm.') !== "DELETE") return;
      state = G.newState(state.className);
      changed();
    },
    logout: function () { Store.logout(); },
    signup: function () { authAction("signup"); },
    "reset-password": function () {
      var email = document.querySelector("#login-form [name=email]").value;
      if (!email) return toast("Type your email first.");
      Store.resetPassword(email).then(function () { toast("Password reset email sent."); }, function (e) { toast(e.message); });
    }
  };

  function authAction(kind) {
    var form = document.getElementById("login-form");
    var email = form.email.value;
    var password = form.password.value;
    if (!email || password.length < 6) return toast("Enter your email and a password of at least 6 characters.");
    Store[kind](email, password).catch(function (e) { toast(e.message); });
  }

  document.addEventListener("click", function (e) {
    var target = e.target.closest("[data-action], [data-view]");
    if (!target) return;
    if (target.dataset.view && !target.dataset.action) {
      if (target.dataset.view === "quest") {
        studentMode = true;
        turn = {};
        render();
        return;
      }
      return actions.go(target.dataset);
    }
    var fn = actions[target.dataset.action];
    if (fn) fn(target.dataset);
  });

  document.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "login-form") return authAction("login");
    if (e.target.id === "add-student") {
      var f = e.target;
      G.addStudent(state, { name: f.name.value, hero: f.hero.value, cls: f.cls.value, pic: f.pic.value });
      toast("Added " + f.name.value.trim() + ". Draw teams again when everyone is in.");
      changed();
      setTimeout(function () { var n = document.querySelector("#add-student [name=name]"); if (n) n.focus(); }, 0);
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id !== "import-file" || !e.target.files[0]) return;
    e.target.files[0].text().then(function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.students)) throw new Error("bad file");
      if (!window.confirm("Replace this class with the backup?")) return;
      state = data;
      toast("Backup restored.");
      changed();
    }).catch(function () { toast("That file isn't a ClassQuest Heroes backup."); });
  });

  // ---------- start ----------

  var stopWatching = function () {};

  Store.start(function (user) {
    stopWatching();
    if (!user) {
      state = null;
      render();
      return;
    }
    Store.load().then(function (loaded) {
      state = loaded || G.newState("My class");
      if (!loaded) save();
      render();
      stopWatching = Store.watch(function (remote) {
        state = remote;
        render();
      });
    }).catch(function () {
      el.innerHTML = '<div class="card"><h2>Couldn\'t load your class</h2><p>Check the internet connection and refresh the page.</p></div>';
    });
  });

  // Roll over to a new school day if the page is left open overnight.
  setInterval(function () {
    if (state && state.today.date !== G.todayString()) changed();
  }, 60000);
})();
