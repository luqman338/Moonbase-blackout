/** DOM adapter: curated archive data, state-driven mission displays and simulation choices. */
import { ACTIONS, TOTAL_TURNS, createGame, retry, chooseAction, getWarning, getDebrief } from './game.mjs';

const el = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-action]')];
let events;
let state;
let initialBattery;
let transitioning = false;
let shiftTimer = 0;
let focusAfterShift = null;

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
  if (state.outcome === 'full-win') return '36 hours complete. Crew safe. Greenhouse light goal reached.';
  if (state.outcome === 'partial-success') return '36 hours complete. Crew safe. Greenhouse light goal missed.';
  if (state.outcome === 'missed-shelter') return 'Crew protection failed. Shelter was not selected during the alert.';
  if (state.outcome === 'power-failure') return 'Life support offline. Battery cannot supply another shift.';
  if (state.outcome) return 'Shelter unavailable. Battery is below the required 18 kWh.';
  if (state.turn === state.alertTurn) return 'Particle alert active. Shelter required for this shift.';
  if (state.turn === TOTAL_TURNS) return `Final shift. ${state.battery} kWh remains. ${Math.max(0, 2 - state.lightPeriods)} light periods still needed.`;
  return `${TOTAL_TURNS - state.log.length} shifts remain. ${state.battery} kWh available. No recharge.`;
}

/** Instrument readings always come from the committed simulation state. */
function renderInstruments() {
  const last = state.log.at(-1);
  const percentage = Math.round(state.battery / initialBattery * 100);
  const ended = Boolean(state.outcome);
  const alert = !ended && !transitioning && state.turn === state.alertTurn;
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
  document.body.dataset.crew = state.crew;
}

/** Lamps show the last completed command, not protection carried into the next shift. */
function renderScene() {
  const last = state.log.at(-1);
  const scene = el('scene');
  const offline = state.outcome === 'power-failure';
  scene.classList.toggle('has-light', last?.action === 'greenhouse' && !offline);
  scene.classList.toggle('has-growth', state.lightPeriods > 0);
  scene.classList.toggle('is-sheltered', last?.action === 'shelter' && state.crew === 'safe');
  scene.classList.toggle('is-conserving', last?.action === 'conserve');
  scene.classList.toggle('low-power', state.battery / initialBattery <= .3);
  scene.classList.toggle('is-alert', !state.outcome && !transitioning && state.turn === state.alertTurn);
  scene.classList.toggle('crew-emergency', state.crew === 'unsafe');
  scene.classList.toggle('is-offline', offline);
  scene.dataset.command = last?.action || 'ready';
  el('scene-story').textContent = storyBeat();
  el('scene-status').textContent = offline ? 'HABITAT / LIFE SUPPORT OFFLINE'
    : state.crew === 'unsafe' ? 'CREW PROTECTION / EMERGENCY'
      : !transitioning && state.turn === state.alertTurn && !state.outcome ? 'PARTICLE ALERT / SHELTER REQUIRED'
        : last?.action === 'shelter' ? `SHELTER OCCUPIED / SHIFT ${last.turn} ONLY`
          : last?.action === 'greenhouse' ? `GROW LIGHTS / SHIFT ${last.turn}`
            : last?.action === 'conserve' ? 'CONSERVE / ESSENTIAL SYSTEMS ONLY' : 'LIFE SUPPORT ONLINE';
}

/** Render the warning before enabling choices. Terminal states block every action. */
function render() {
  const ended = Boolean(state.outcome);
  const alert = !ended && state.turn === state.alertTurn;
  el('turn').textContent = ended
    ? `${state.log.length} of ${TOTAL_TURNS} shifts completed · mission ended`
    : `Shift ${state.turn} of ${TOTAL_TURNS} · hours ${(state.turn - 1) * 6}–${state.turn * 6}`;
  renderInstruments();
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
  renderScene();
  el('radio-label').textContent = ended ? 'FINAL TRANSMISSION' : alert ? 'URGENT / SHELTER REQUIRED' : `CREW REPORT / SHIFT ${state.turn}`;
  el('feedback').textContent = state.log.length || state.outcome
    ? state.feedback.replace(/^Turn /, 'Shift ')
    : 'Solar generation offline. Life support is running on the shared battery.';
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

// Intro state belongs only to this adapter. No transmission consumes mission time.
const transmissions = [
  { title: 'Command transfer', text: 'Outpost 01 to Commander. Our solar panels have stopped generating power. You are taking command of the base. The crew is inside, and every system now depends on the battery you control.' },
  { title: 'Running on reserves', text: 'We expect a 36-hour blackout: six shifts of six hours each. One battery holds 92 kWh of energy for the whole base. It cannot recharge during this mission. What you spend now is gone.' },
  { title: 'One command per shift', text: 'Life support needs 12 kWh each shift. Conserve costs 12 kWh total. Greenhouse and Shelter each cost 18 kWh total, including life support. Choose one command per shift. Extra power spent now leaves less for later.' },
  { title: 'Crew and crops', text: 'Give the greenhouse two light periods before the blackout ends. When a particle alert arrives, choose Shelter to protect the crew. Shelter lasts one shift only. Going in early will not protect a later shift.' },
  { title: 'Your console is ready', text: 'Check the battery bar before each command. Read crew status and greenhouse progress, then check incoming alerts above the action buttons. Select Assume Command to open the console. Your first choice starts the six-hour shift.' },
];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let transmissionIndex = 0;
let revealFrame = 0;
let revealing = false;
let reviewing = false;
let returnScroll = 0;
let lastNextTime = -Infinity;

function setScreen(screen) {
  document.body.dataset.screen = screen;
  el('briefing').hidden = screen !== 'briefing';
  el('command').hidden = screen !== 'game';
  el('mission').hidden = screen !== 'game';
  for (const id of ['masthead', 'scene', 'source-footer']) el(id).hidden = screen === 'briefing';
  el('start').hidden = screen !== 'launch';
  document.querySelector('.skip-link').hidden = screen !== 'game';
}

function completeTransmission() {
  cancelAnimationFrame(revealFrame);
  revealing = false;
  el('transmission-text').textContent = transmissions[transmissionIndex].text;
  el('transmission-cursor').hidden = true;
}

function showTransmission() {
  cancelAnimationFrame(revealFrame);
  const message = transmissions[transmissionIndex];
  el('transmission-body').scrollTop = 0;
  el('transmission-title').textContent = message.title;
  el('transmission-count').textContent = `${String(transmissionIndex + 1).padStart(2, '0')}/05`;
  el('transmission-id').textContent = `MB-0${transmissionIndex + 1} / ${reviewing ? 'BRIEFING REVIEW' : 'COMMAND TRANSFER'}`;
  el('transmission-readable').textContent = message.text;
  el('next-transmission').textContent = transmissionIndex === transmissions.length - 1
    ? reviewing ? 'Return to Mission' : 'Assume Command' : 'Next Transmission →';
  el('transmission-text').textContent = '';
  el('transmission-cursor').hidden = false;
  if (reducedMotion.matches) { completeTransmission(); return; }
  revealing = true;
  const started = performance.now();
  // One short reveal per message, capped at 1.2 seconds regardless of message length.
  function reveal(now) {
    const count = Math.floor(message.text.length * Math.min(1, (now - started) / 1200));
    el('transmission-text').textContent = message.text.slice(0, count);
    if (count === message.text.length) completeTransmission();
    else revealFrame = requestAnimationFrame(reveal);
  }
  revealFrame = requestAnimationFrame(reveal);
}

function openBriefing(review = false) {
  reviewing = review;
  returnScroll = window.scrollY;
  transmissionIndex = 0;
  lastNextTime = -Infinity;
  setScreen('briefing');
  el('skip').textContent = reviewing ? 'Return to Mission' : 'Skip Intro';
  showTransmission();
  window.scrollTo(0, 0);
  el('transmission-title').focus();
}

function takeCommand() {
  cancelAnimationFrame(revealFrame);
  setScreen('game');
  el('mission-title').textContent = 'Your next six hours';
  render();
  el('mission-title').focus();
}

function leaveBriefing() {
  cancelAnimationFrame(revealFrame);
  revealing = false;
  if (reviewing) {
    setScreen('game');
    window.scrollTo(0, returnScroll);
    el('review-briefing').focus({ preventScroll: true });
  } else takeCommand();
}

el('start').addEventListener('click', () => openBriefing());
el('review-briefing').addEventListener('click', () => openBriefing(true));
el('skip').addEventListener('click', leaveBriefing);
el('next-transmission').addEventListener('keydown', (event) => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
});
el('next-transmission').addEventListener('click', (event) => {
  // Ignore the second click in a double-click and rapid key/touch repeats.
  const now = performance.now();
  if (event.detail > 1 || now - lastNextTime < 300) return;
  lastNextTime = now;
  if (revealing) { completeTransmission(); return; }
  if (transmissionIndex === transmissions.length - 1) { leaveBriefing(); return; }
  transmissionIndex += 1;
  showTransmission();
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches && revealing) completeTransmission();
});
setScreen('launch');
el('retry').addEventListener('click', () => {
  state = retry(events);
  takeCommand();
});
/** Commit once, then play a skippable visual response. Effects cannot spend energy. */
function finishShift() {
  if (!transitioning) return;
  clearTimeout(shiftTimer);
  transitioning = false;
  el('shift-response').hidden = true;
  el('command').classList.remove('is-transitioning');
  el('scene').classList.remove('is-transitioning');
  el('review-briefing').disabled = false;
  render();
  if (!state.outcome) {
    if (state.turn === state.alertTurn) el('warning').focus();
    else if (focusAfterShift && !focusAfterShift.disabled) focusAfterShift.focus({ preventScroll: true });
    else buttons.find((button) => !button.disabled)?.focus({ preventScroll: true });
  }
}

el('skip-shift').addEventListener('click', finishShift);
for (const button of buttons) {
  button.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    if (transitioning || state.outcome || event.detail > 1) return;
    const previous = state;
    const next = chooseAction(state, button.dataset.action);
    state = next;
    // Rejected commands and immediate failures have no successful shift to animate.
    if (next.log.length === previous.log.length || reducedMotion.matches) {
      render();
      if (!state.outcome && state.turn === state.alertTurn) el('warning').focus();
      return;
    }
    transitioning = true;
    focusAfterShift = button;
    el('command').classList.add('is-transitioning');
    el('scene').classList.add('is-transitioning');
    buttons.forEach((control) => { control.disabled = true; });
    el('review-briefing').disabled = true;
    renderInstruments();
    renderScene();
    const report = {
      conserve: 'Nonessential lighting off. Life support stays on.',
      greenhouse: 'Grow lights on. One light period delivered.',
      shelter: 'Crew in shelter. Protection applies to this shift only.',
    }[button.dataset.action];
    el('shift-status').textContent = `Shift ${previous.turn}: ${report} ${ACTIONS[button.dataset.action].cost} kWh used.`;
    el('shift-response').hidden = false;
    el('radio-label').textContent = 'COMMAND EXECUTING';
    el('feedback').textContent = report;
    el('radio-next').textContent = `${state.battery} kWh remaining.`;
    // Shift number, timeline and incoming alert update only after this visual interval.
    shiftTimer = setTimeout(finishShift, 1000);
    el('skip-shift').focus({ preventScroll: true });
  });
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches && transitioning) finishShift();
});

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
} catch (error) {
  el('load-status').textContent = `Could not load the mission. Use a local HTTP preview and reload. ${error.message}`;
}
