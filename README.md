# Moonbase Blackout

An educational lunar mission for ages 7–12, created for NASA Space Apps Challenge 2026: **Build a Junior Astronaut Mission Trainer**. Plan across six six-hour shifts, protect the crew and supply two greenhouse light periods from a fictional 92 kWh battery.

[Play the public demo](https://luqman338.github.io/Moonbase-blackout/) · [Challenge](https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/)

The public copy may lag this local checkout. This release audit does not deploy or submit the project. See [RELEASE_REPORT.md](./RELEASE_REPORT.md) for outstanding browser checks and release status.

## How to play

Begin Mission opens five manually advanced transmissions. Assume Command opens the console. Each shift, read the warning and choose one command:

| Command | Total cost | Purpose |
| --- | --- | --- |
| Conserve | 12 kWh | Essential life support |
| Greenhouse | 18 kWh | Life support and one light period |
| Shelter | 18 kWh | Life support and protection for that shift only |

Shelter when the particle alert appears. Earlier shelter does not cover a later shift. Costs appear before selection. Commands run through acknowledgement, operation and transmission, then wait for Continue. Skip Animation changes presentation only. Complete six shifts with safe crew and at least two light periods for full success. Retry resets the mission. The game uses visual feedback without audio. Behind the Mission explains the science, development, credits and privacy.

## NASA data and assumptions

[data/events.json](./data/events.json) preserves the retrieved NASA DONKI SEP object `2024-05-11T04:07:00-SEP-001`, recorded at `2024-05-11T04:07Z` by STEREO A: IMPACT 13-100 MeV. Sources: [CCMC record](https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/30717/-1) and [dated API query](https://api.nasa.gov/DONKI/SEP?startDate=2024-05-11&endDate=2024-05-11&api_key=DEMO_KEY). The stored retrieval date is November 14, 2026. A fresh retrieval could not be completed during this release audit.

The SEP links flare `2024-05-11T01:10:00-FLR-001`. Its begin time, `2024-05-11T01:10:00Z`, is a supplied specification fact, not an independently retrieved FLR response. Wrapper metadata and the flare subset are local curation.

The fictional start is 12 hours before that supplied flare time: `2024-05-10T13:10:00Z`. The SEP observation follows 14 h 57 min later. `1 + floor(elapsed hours / 6)` places the warning before shift 3. No event timing was changed.

The blackout, starting battery, energy costs, six-hour shifts and shelter protection are fictional. Shelter's extra 6 kWh represents fictional ventilation. Two light periods are a simplified objective, not a crop-growth model. Particles are a schematic visualization, not visible radiation. DONKI does not predict conditions or radiation dose at this fictional base. There are no live forecast calls.

## Run and test

No dependencies, framework, backend or build step. Serve the directory over HTTP:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/. Direct file opening cannot reliably load the JSON. Relative application asset paths support the GitHub Pages repository prefix.

Node.js 18 or newer is needed only for tests:

```sh
node --test game.test.mjs
node --check game.mjs
node --check app.mjs
node --check mission-story.mjs
```

The audio-removal release run passed all 11 simulation tests. They cover outcomes, accounting, timing, pre-choice warning order, Retry, terminal conditions, nonnegative battery and input-state immutability. Browser checks for this release remain unverified. Earlier development checks are historical, not a substitute for checking this version.

## Implementation

- `game.mjs`: pure simulation, timestamp conversion and terminal rules.
- `app.mjs`: DOM rendering, five-part intro, command phases, navigation and reports.
- `index.html`, `styles.css`, `assets/favicon.svg`: interface, original SVG exterior and browser identity.
- `mission-story.mjs`: public project story and editable credits. Everything in this file is publicly readable; never put private tester information here.
- `data/events.json`: preserved archive record and explicit provenance.

Less than 12 kWh before a shift ends in power failure. On the alert shift, less than 18 kWh prevents shelter. A funded non-Shelter alert choice fails without spending energy. Six completed shifts end the mission without requiring a seventh shift's energy.

## People and AI assistance

Luqman led the concept, research, requirements, educational design, engineering trade-offs, gameplay, UI/UX, feedback collection, testing and iteration. Feedback from children in his community STEM, business and leadership program informed pacing, storytelling and interaction changes. No measured learning gains are claimed or child identities published.

Farhan, Luqman's father, supported the project as Advisor and Code Reviewer. ChatGPT assisted research, brainstorming, planning, prompts and review. Codex assisted coding, tests, styling, debugging and documentation. Luqman directed the project, design and decisions, and performed testing and review. The code is not presented as independently hand-written by Luqman.

## Privacy and licensing

The game has no accounts, forms, analytics, advertising, cookies or gameplay reporting. The game does not save preferences or mission progress in local storage. GitHub Pages hosts the public site and [logs visitor IP addresses for security](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection). External links have their own privacy practices.

Original project materials are offered under the complete [Apache License 2.0](./LICENSE), with attribution in [NOTICE](./NOTICE). NASA records retain separate terms. No third-party audio is included. See [ASSET_CREDITS.md](./ASSET_CREDITS.md). Apache does not require prominent UI attribution or grant rights the project does not own.

## Known limitations

This independent educational game is not an official NASA product or real mission-planning software. It does not model radiation dose, shielding, crop physiology, thermal behaviour or real life-support demand. Screen-reader, touch and final responsive browser checks remain necessary. All third-party audio has been removed, resolving the previous audio-provenance release blocker. This does not certify overall submission eligibility.
