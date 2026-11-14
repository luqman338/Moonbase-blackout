# Repository rules

- Use plain HTML, CSS, and JavaScript ES modules. No dependencies or build step.
- Keep pure simulation in `game.mjs` and DOM/UI code in `app.mjs`.
- Preserve NASA source URLs and actual retrieved fields. Label supplied facts, archive observations, and fictional assumptions honestly. No live forecasts.
- Add brief module introductions and comments for important rules, timing, and terminal conditions.
- Run `node --test game.test.mjs` before changes and after changing behavior. Check the turn-3 warning before a choice.
- Keep scope to the May six-turn mission. Use relative asset paths.
- Finish with a concise list of changed files, check results, and remaining issues.
