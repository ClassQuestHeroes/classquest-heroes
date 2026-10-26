// Saving and loading. With no Firebase settings in firebase-config.js the game
// runs in demo mode and saves in this browser only. With settings, the teacher
// logs in and the class is saved to their Firebase database.
(function (root) {
  "use strict";

  var DEMO_KEY = "classquest-heroes-demo";

  function hasFirebase() {
    var c = root.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId);
  }

  var DemoStore = {
    mode: "demo",
    start: function (onUser) { onUser({ uid: "demo", email: "Demo mode" }); },
    load: function () {
      try {
        var raw = localStorage.getItem(DEMO_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.resolve(null);
      }
    },
    save: function (state) {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
      return Promise.resolve();
    },
    watch: function () { return function () {}; },
    logout: function () { return Promise.resolve(); }
  };

  function FirebaseStore() {
    firebase.initializeApp(root.FIREBASE_CONFIG);
    var auth = firebase.auth();
    var db = firebase.firestore();
    var user = null;

    function doc() {
      return db.collection("teachers").doc(user.uid);
    }

    return {
      mode: "firebase",
      start: function (onUser) {
        auth.onAuthStateChanged(function (u) {
          user = u;
          onUser(u);
        });
      },
      login: function (email, password) {
        return auth.signInWithEmailAndPassword(email, password);
      },
      signup: function (email, password) {
        return auth.createUserWithEmailAndPassword(email, password);
      },
      resetPassword: function (email) {
        return auth.sendPasswordResetEmail(email);
      },
      logout: function () {
        return auth.signOut();
      },
      load: function () {
        return doc().get().then(function (snap) {
          return snap.exists ? JSON.parse(snap.data().state) : null;
        });
      },
      // The class is stored as one JSON text field: a class of 30 is well under
      // Firestore's 1 MB document limit.
      save: function (state) {
        return doc().set({
          state: JSON.stringify(state),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      },
      // Keeps two teacher devices (e.g. phone and class board) in step.
      watch: function (onChange) {
        return doc().onSnapshot(function (snap) {
          if (snap.exists && !snap.metadata.hasPendingWrites) onChange(JSON.parse(snap.data().state));
        });
      }
    };
  }

  root.Store = hasFirebase() ? FirebaseStore() : DemoStore;
})(this);
