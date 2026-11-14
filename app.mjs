/** DOM adapter: load curated data, render state, and pass choices to the simulation. */
import { ACTIONS, createGame, retry, chooseAction, getWarning, getDebrief } from './game.mjs';

const el = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-action]')];
let events;
let state;

/** Render the warning before enabling choices; terminal states disable every move. */
function render() {
  el('turn').textContent = `${state.turn} of 6 · hours ${(state.turn - 1) * 6}–${state.turn * 6}${state.outcome ? ' · ended' : ''}`;
  el('battery').textContent = `${state.battery} kWh`;
  el('crew').textContent = state.crew === 'safe' ? 'Safe' : 'Unsafe';
  el('greenhouse').textContent = `${state.lightPeriods} of 2 light periods`;
  el('warning').textContent = getWarning(state);
  el('warning').classList.toggle('alert', !state.outcome && state.turn === state.alertTurn);
  for (const button of buttons) {
    const action = button.dataset.action;
    const cost = ACTIONS[action].cost;
    button.disabled = Boolean(state.outcome) || state.battery < cost;
    if (action !== 'conserve') {
      el(`${action}-reason`).textContent = !state.outcome && state.battery < cost
        ? `Unavailable: needs ${cost} kWh; only ${state.battery} kWh remains.` : '';
    }
  }
  el('feedback').textContent = state.feedback;
  el('log').replaceChildren(...state.log.map((entry) => {
    const item = document.createElement('li');
    item.textContent = `Turn ${entry.turn}: ${ACTIONS[entry.action].label}, ${entry.cost} kWh.`;
    return item;
  }));
  const debrief = getDebrief(state);
  el('outcome').hidden = !debrief;
  if (debrief) {
    el('outcome-title').textContent = debrief.title;
    el('debrief').textContent = debrief.text;
    el('outcome-title').focus();
  }
}

function takeCommand() {
  el('briefing').hidden = true;
  el('mission').hidden = false;
  render();
  el('mission-title').focus();
}

el('start').addEventListener('click', takeCommand);
el('retry').addEventListener('click', () => {
  state = retry(events);
  takeCommand();
});
for (const button of buttons) {
  button.addEventListener('click', () => {
    state = chooseAction(state, button.dataset.action);
    render();
  });
}

// Local relative paths also work below a GitHub Pages repository prefix.
try {
  const response = await fetch('./data/events.json');
  if (!response.ok) throw new Error(`Mission data returned HTTP ${response.status}.`);
  events = await response.json();
  state = createGame(events);
  el('timing').textContent = `The flare time sets the fictional start to ${state.fictionalScenarioStart}. The particle observation is ${Math.floor(state.elapsedMinutes / 60)} h ${state.elapsedMinutes % 60} min later, so the warning appears before your turn-${state.alertTurn} choice. Each turn lasts 6 hours.`;
  el('load-status').textContent = '';
  el('start').disabled = false;
} catch (error) {
  el('load-status').textContent = `Could not load the mission. Use a local HTTP preview and reload. ${error.message}`;
}
