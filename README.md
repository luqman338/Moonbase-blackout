# Moonbase Blackout

A first playable educational game for ages 7–12. Manage a fictional lunar outpost for six 6-hour turns. Keep the crew safe, shelter on the particle-alert turn, and supply at least two greenhouse light periods. Starts with 92 kWh. No framework, build step, backend, or dependencies.

## Preview

From this repository, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. Use HTTP rather than opening `index.html` as a file so the browser can load local JSON. All application asset paths are relative and support a GitHub Pages repository prefix. Nothing has been deployed.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Briefing, mission controls, debrief, and source explanation |
| `styles.css` | Basic layout and keyboard focus |
| `game.mjs` | Pure state transitions, timing, warnings, and debriefs |
| `app.mjs` | Local JSON loading and DOM rendering |
| `data/events.json` | Curated archive record and explicit provenance |
| `game.test.mjs` | Dependency-free Node rule and warning checks |
| `AGENTS.md` | Recurring project rules |

## NASA provenance and game assumptions

The local dataset uses archived May 2024 NASA CCMC DONKI observations, **not lunar radiation forecasts**. There are no live forecast calls during play.

- Retrieved on November 14, 2026: the matching SEP object from the [NASA DONKI SEP API](https://api.nasa.gov/DONKI/SEP?startDate=2024-05-11&endDate=2024-05-11&api_key=DEMO_KEY). The object is preserved unchanged under `sep`, including available instrument, linked events, notification, submission, and version metadata. The wrapper and `provenance` fields are local curation metadata, not NASA API fields.
- [SEP source record](https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/30717/-1): `2024-05-11T04:07:00-SEP-001`. Its returned `eventTime` is `2024-05-11T04:07Z`, equivalent to `2024-05-11T04:07:00Z`. The source page was also retrieved, but its initial HTML did not contain the observation details.
- The SEP's `linkedEvents` confirms flare ID `2024-05-11T01:10:00-FLR-001`. The flare `beginTime`, `2024-05-11T01:10:00Z`, comes from the verified facts supplied in the project specification. Independent flare retrieval failed: the NASA FLR API returned HTTP 404 and the CCMC web-service request timed out. No further flare metadata or source URL has been invented. The local `flare` object is a curated supplied-fact subset, not a retrieved API response.

The simulation converts UTC timestamps to milliseconds. It subtracts 12 hours from flare beginTime to create the **fictional** scenario start, `2024-05-10T13:10:00Z`. The SEP event is 14 h 57 min later. `1 + Math.floor(elapsedMilliseconds / (6 * 60 * 60 * 1000))` gives turn 3. Its warning appears before the third choice.

The blackout, clock offset, energy budget, 6-hour turns, greenhouse periods, and shelter effect are game assumptions. Conserve costs 12 kWh for essential life support. Greenhouse costs 18 kWh total and adds one light period. Shelter costs 18 kWh total, including fictional extra 6 kWh ventilation, and protects only its own turn.

Before each turn, less than 12 kWh ends in power failure. On the alert turn, less than 18 kWh then ends in shelter power shortfall. A funded non-Shelter choice on that turn ends in missed shelter without spending energy. Other affordable moves spend energy and are logged. After six completed moves, a safe crew with at least two light periods wins. A safe crew with fewer periods earns partial success. There is no seventh-turn energy requirement. Terminal states block all actions. Retry resets May and skips the briefing.

## Verification

Requires Node.js 18 or newer for tests only:

```sh
node --test game.test.mjs
node --check game.mjs
node --check app.mjs
```

All 11 tests passed during implementation. They cover all requested sequences/reset rules, exact timestamp conversion, warning state before turn 3, warning placement before controls, pre-turn power priority, unaffordable moves, turn-only shelter, and nonnegative battery across all six-turn action sequences.

Manual browser check: Take Command, choose Conserve twice, confirm the particle warning appears before choosing turn 3, then Shelter, Greenhouse, Greenhouse, Conserve. Expect a full win with 2 kWh. Retry should immediately return to turn 1 with 92 kWh and no briefing. Tab through native buttons to check focus. An interactive browser playtest could not be performed in the implementation session because no browser connection was available. Automated warning checks cover simulation state and source order, not a live browser rendering.

## AI assistance

OpenAI Codex generated the initial implementation, tests, and documentation from the user's specification and retrieved the SEP archive record. Automated tests check game behavior. A human review and playtest are still useful before classroom use.
