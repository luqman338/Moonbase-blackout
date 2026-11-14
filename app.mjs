/** DOM adapter: curated archive data, state-driven mission displays and simulation choices. */
import { ACTIONS, TOTAL_TURNS, createGame, retry, chooseAction, getWarning, getDebrief } from './game.mjs';

const el = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-action]')];
let events;
let state;
let initialBattery;

// This is a planning calculation, not an extra resource or a prediction of success.
function energyPlan() {
  const turnsLeft = TOTAL_TURNS - state.log.length;
  const lightsNeeded = Math.max(0, 2 - state.lightPeriods);
  const shelterNeeded = state.turn <= state.alertTurn ? 1 : 0;
  const essentialCost = ACTIONS.conserve.cost;
  const minimum = turnsLeft * essentialCost
    + lightsNeeded * (ACTIONS.greenhouse.cost - essentialCost)
    + shelterNeeded * (ACTIONS.shelter.cost - essentialCost);
  const spare = state.battery - minimum;
  if (lightsNeeded + shelterNeeded > turnsLeft) {
    return 'There are too few turns left for all needed light periods and shelter. You can still protect the crew.';
  }
  return spare >= 0
    ? `Plan ahead: ${minimum} kWh covers the remaining life support, ${lightsNeeded} needed light ${lightsNeeded === 1 ? 'period' : 'periods'}${shelterNeeded ? ' and alert-turn shelter' : ''}. Your spare energy: ${spare} kWh.`
    : `Energy is tight: the remaining goals need at least ${minimum} kWh. You have ${state.battery} kWh. Each extra Greenhouse or Shelter choice costs ${ACTIONS.greenhouse.cost - essentialCost} kWh more than Conserve.`;
}

function storyBeat() {
  if (state.outcome === 'full-win') return 'Crew safe. Plants growing. You brought the outpost through.';
  if (state.outcome === 'partial-success') return 'The crew made it through. The plants still need more light.';
  if (state.outcome) return 'The mission has ended. Your next plan starts here.';
  if (state.turn === state.alertTurn) return 'Particle alert. Get the crew to shelter this turn.';
  if (state.turn >= 5) return `Final hours. ${state.battery} kWh left. Make every choice count.`;
  if (state.turn > state.alertTurn) return 'The alert turn is over. Check the plants and your reserves.';
  if (state.turn > 1) return 'The battery is shrinking. Leave room for what comes next.';
  return 'A quiet outpost. One shared battery. You’re in command.';
}

/** Render the warning before enabling choices. Terminal states block every action. */
function render() {
  const last = state.log.at(-1);
  const percentage = Math.round(state.battery / initialBattery * 100);
  const ended = Boolean(state.outcome);
  const alert = !ended && state.turn === state.alertTurn;
  el('turn').textContent = ended
    ? `${state.log.length} of ${TOTAL_TURNS} turns completed · mission ended`
    : `Turn ${state.turn} of ${TOTAL_TURNS} · hours ${(state.turn - 1) * 6}–${state.turn * 6}`;
  el('battery').textContent = `${state.battery} kWh`;
  el('battery-percent').textContent = `${percentage}%`;
  el('battery-fill').style.width = `${state.battery / initialBattery * 100}%`;
  el('battery-meter').setAttribute('aria-valuemax', initialBattery);
  el('battery-meter').setAttribute('aria-valuenow', state.battery);
  el('battery-meter').setAttribute('aria-valuetext', `${state.battery} kWh, ${percentage} percent`);
  el('battery-meter').classList.toggle('low', percentage <= 30);
  el('crew').textContent = state.crew === 'safe' ? 'Crew safe' : 'Crew unsafe';
  el('shelter-status').textContent = ended ? 'See mission debrief' : alert
    ? 'Shelter needed this turn' : last?.action === 'shelter'
      ? `Sheltered on turn ${last.turn} only` : 'No shelter active';
  el('greenhouse').textContent = `${state.lightPeriods} / 2 light periods`;
  el('plant-status').textContent = state.lightPeriods >= 2 ? 'Light goal reached' : `${2 - state.lightPeriods} more needed`;
  el('warning').textContent = getWarning(state);
  el('warning').classList.toggle('alert', alert);
  el('alert-source').hidden = !alert;
  for (const button of buttons) {
    const action = button.dataset.action;
    const cost = ACTIONS[action].cost;
    button.querySelector('.action-cost').textContent = `${cost} kWh total`;
    button.disabled = ended || state.battery < cost;
    el(`${action}-reason`).textContent = ended ? '' : state.battery < cost
      ? `Unavailable: needs ${cost} kWh; only ${state.battery} kWh remains.`
      : `Leaves ${state.battery - cost} kWh.`;
  }
  el('energy-plan').textContent = ended ? 'All action costs include life support. No battery recharge during this mission.' : energyPlan();
  el('scene-story').textContent = storyBeat();
  // A lit greenhouse records light delivered. A shelter light marks the last turn only.
  el('scene').classList.toggle('has-light', state.lightPeriods > 0);
  el('scene').classList.toggle('is-sheltered', last?.action === 'shelter' && state.crew === 'safe');
  el('scene').classList.toggle('low-power', percentage <= 30);
  el('scene').classList.toggle('is-alert', alert);
  el('scene-status').textContent = state.crew === 'unsafe' ? 'Mission ended / crew unsafe'
    : last?.action === 'shelter' ? `Shelter lit / turn ${last.turn} only`
      : percentage <= 30 ? 'Low reserves / essential lights dimmed'
        : state.lightPeriods ? 'Greenhouse light delivered' : 'Essential lights online';
  el('radio-label').textContent = ended ? 'FINAL TRANSMISSION' : alert ? 'URGENT / SHELTER REQUIRED' : `CREW REPORT / TURN ${state.turn}`;
  el('feedback').textContent = state.feedback;
  el('radio-next').textContent = storyBeat();
  el('timeline').replaceChildren(...Array.from({ length: TOTAL_TURNS }, (_, index) => {
    const turn = index + 1;
    const entry = state.log.find((move) => move.turn === turn);
    const item = document.createElement('li');
    item.classList.toggle('done', Boolean(entry));
    item.classList.toggle('current', !ended && state.turn === turn);
    item.classList.toggle('alert-turn', alert && turn === state.alertTurn);
    if (!ended && state.turn === turn) item.setAttribute('aria-current', 'step');
    const label = document.createElement('span');
    label.textContent = `0${turn}`;
    const detail = document.createElement('small');
    detail.textContent = entry ? ACTIONS[entry.action].label : !ended && state.turn === turn ? 'Choose now' : ended ? 'Unplayed' : `${(turn - 1) * 6}–${turn * 6} h`;
    item.append(label, detail);
    return item;
  }));
  el('log-count').textContent = `${state.log.length} / ${TOTAL_TURNS}`;
  el('log').replaceChildren(...state.log.map((entry) => {
    const item = document.createElement('li');
    item.textContent = `Turn ${entry.turn}: ${ACTIONS[entry.action].label}, ${entry.cost} kWh.`;
    return item;
  }));
  const debrief = getDebrief(state);
  el('outcome').hidden = !debrief;
  if (debrief) {
    el('outcome').classList.toggle('failure', state.outcome !== 'full-win');
    el('mission-title').textContent = 'Mission ended';
    el('outcome-title').textContent = debrief.title;
    el('debrief').textContent = debrief.text;
    el('result-stats').textContent = `${state.battery} kWh remaining · ${state.crew === 'safe' ? 'Crew safe' : 'Crew unsafe'} · ${state.lightPeriods} / 2 light periods`;
    el('outcome-title').focus();
  }
}

function takeCommand() {
  el('briefing').hidden = true;
  el('mission').hidden = false;
  el('mission-title').textContent = 'Your next six hours';
  render();
  el('mission-title').focus();
}

el('start').addEventListener('click', takeCommand);
el('skip').addEventListener('click', takeCommand);
el('retry').addEventListener('click', () => {
  state = retry(events);
  takeCommand();
});
for (const button of buttons) {
  button.addEventListener('click', () => {
    const previousTurn = state.turn;
    state = chooseAction(state, button.dataset.action);
    render();
    // Bring the new alert into view even if a phone was scrolled to a lower action.
    if (!state.outcome && state.turn !== previousTurn && state.turn === state.alertTurn) {
      el('warning').focus();
    }
  });
}

// Relative data paths work in a local preview and below a repository URL prefix.
try {
  const response = await fetch('./data/events.json');
  if (!response.ok) throw new Error(`Mission data returned HTTP ${response.status}.`);
  events = await response.json();
  state = createGame(events);
  initialBattery = state.battery;
  el('timing').textContent = `The supplied flare start sets the fictional mission start to ${state.fictionalScenarioStart}. The archived particle observation is ${Math.floor(state.elapsedMinutes / 60)} h ${state.elapsedMinutes % 60} min later, placing the game alert before the turn-${state.alertTurn} choice. Each turn lasts 6 hours.`;
  el('source-observation').textContent = `Recorded NASA SEP event: ${events.sep.sepID}. Observation time: ${events.sep.eventTime}. Instrument: ${events.sep.instruments.map((instrument) => instrument.displayName).join(', ')}. Retrieved: ${events.provenance.retrievedOn}.`;
  el('flare-source').textContent = `Linked flare ID: ${events.flare.flrID}. Supplied flare start: ${events.flare.beginTime}. ${events.provenance.flareProvenance}`;
  el('load-status').textContent = '';
  el('start').disabled = false;
  el('skip').disabled = false;
} catch (error) {
  el('load-status').textContent = `Could not load the mission. Use a local HTTP preview and reload. ${error.message}`;
}
