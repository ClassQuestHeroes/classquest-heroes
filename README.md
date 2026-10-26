# ClassQuest Heroes

A classroom rewards game for primary school classes. Teachers create magical characters for their students, who work in random teams to get through the week.

- **Play it:** https://classquestheroes.github.io/classquest-heroes/app/
- **School network test:** https://classquestheroes.github.io/classquest-heroes/

## How it works

- Four classes: Healer, Warrior, Rogue and Wizard. Each morning the teacher ticks attendance: 1 point for being at school, 2 for being seated by the end of the song.
- The teacher gives and takes gems (team points) for answers, behaviour and playground choices.
- During the daily quest window, students take turns on the class device, unlock their hero with a secret picture, and use their powers.
- On Friday, teams with 10+ gems and everyone still on at least 1 point have made it through the week.

## Files

- `app/game.js`: the game rules (no screen code), tested in `test/game.test.js` with `node --test test/`.
- `app/app.js`: the screens.
- `app/store.js`: saving. Demo mode saves in the browser; with `app/firebase-config.js` filled in, it saves to Firebase.
- `firestore.rules`: each teacher can only see their own class.

## Student privacy

Only first names, hero names and game points are stored. No surnames, photos, emails or student accounts.
