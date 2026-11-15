/** DOM adapter: archive provenance, terminal screens and a phase-driven command console. */
import { ACTIONS, TOTAL_TURNS, createGame, retry, chooseAction, getWarning, getDebrief } from './game.mjs';

const el = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-action]')];
let events;
let state;
let initialBattery;
let resolvingShift = null;
let shiftTimer = 0;
let focusAfterShift = null;
let monitorFrame = 0;
let monitorMessage = '';

// The simulation commits immediately. This phase only controls presentation and input.
// Terminal outcomes take priority over animation, including power loss after a funded shift.
function presentationPhase() {
  return state.outcome ? 'ended' : resolvingShift ? 'resolving' : 'awaiting';
}

function outcomeReport() {
  switch (state.outcome) {
    case 'full-win': return `36 hours complete. Crew safe. Greenhouse received ${state.lightPeriods} light periods.`;
    case 'partial-success': return `36 hours complete. Crew safe. Greenhouse received ${state.lightPeriods} of 2 required light periods.`;
    case 'missed-shelter': return `Shelter was not selected for shift ${state.alertTurn}. Crew unsafe. No energy was spent on the failed command.`;
    case 'shelter-power-shortfall': return `${state.battery} kWh remained. Shelter required 18 kWh for this shift. Crew unsafe.`;
    case 'power-failure': return `${state.battery} kWh remained before shift ${state.turn}. Life support requires 12 kWh. Life support is offline.`;
    default: return '';
  }
}

function completeMonitorMessage() {
  cancelAnimationFrame(monitorFrame);
  monitorFrame = 0;
  el('feedback').textContent = monitorMessage;
  el('monitor-cursor').hidden = true;
}

/** Only the secondary result is typed. Alerts, costs and readings are never delayed. */
function showMonitorMessage(message) {
  if (message === monitorMessage) return;
  cancelAnimationFrame(monitorFrame);
  monitorMessage = message;
  el('feedback-readable').textContent = message;
  if (!message || reducedMotion.matches) { completeMonitorMessage(); return; }
  el('feedback').textContent = '';
  el('monitor-cursor').hidden = false;
  const started = performance.now();
  const duration = Math.min(600, message.length * 8);
  function reveal(now) {
    const count = Math.floor(message.length * Math.min(1, (now - started) / duration));
    el('feedback').textContent = message.slice(0, count);
    if (count === message.length) completeMonitorMessage();
    else monitorFrame = requestAnimationFrame(reveal);
  }
  monitorFrame = requestAnimationFrame(reveal);
}

function decisionFact() {
  const lightsNeeded = Math.max(0, 2 - state.lightPeriods);
  const shiftsLeft = TOTAL_TURNS - state.log.length;
  if (state.battery < ACTIONS.greenhouse.cost) return `Only Conserve is affordable at ${state.battery} kWh.`;
  if (lightsNeeded > shiftsLeft) return `${shiftsLeft} shifts remain. The two-period light goal can no longer be reached.`;
  if (lightsNeeded && shiftsLeft <= 2) return `${lightsNeeded} more light ${lightsNeeded === 1 ? 'period is' : 'periods are'} needed before the mission ends.`;
  if (state.lightPeriods >= 2) return 'Light goal reached. Extra Greenhouse commands still use 18 kWh.';
  return '';
}

/** Instruments always use committed resources. Activity lamps use only the resolving phase. */
function renderInstruments() {
  const phase = presentationPhase();
  const active = phase === 'resolving' ? resolvingShift.action : null;
  const alert = phase === 'awaiting' && state.turn === state.alertTurn;
  const percentage = Math.round(state.battery / initialBattery * 100);
  el('battery').textContent = `${state.battery} kWh`;
  el('battery-percent').textContent = `${percentage}%`;
  el('battery-fill').style.width = `${state.battery / initialBattery * 100}%`;
  el('battery-meter').setAttribute('aria-valuemax', initialBattery);
  el('battery-meter').setAttribute('aria-valuenow', state.battery);
  el('battery-meter').setAttribute('aria-valuetext', `${state.battery} kWh, ${percentage} percent`);
  el('battery-meter').classList.toggle('low', percentage <= 30);
  el('crew').textContent = state.crew === 'safe' ? 'Crew safe' : 'Crew unsafe';
  el('shelter-status').textContent = active === 'shelter' ? `Shelter active / shift ${resolvingShift.turn}`
    : alert ? 'Shelter required this shift' : 'Shelter inactive';
  el('greenhouse').textContent = `${state.lightPeriods} / 2`;
  el('plant-status').textContent = state.lightPeriods >= 2 ? 'Light goal reached' : `${2 - state.lightPeriods} more needed`;
  el('light-status').textContent = active === 'greenhouse' ? `Grow lights on / shift ${resolvingShift.turn}` : 'Grow lights off';
  [...document.querySelectorAll('.light-periods span')].forEach((lamp, index) => lamp.classList.toggle('lit', state.lightPeriods > index));
  document.body.dataset.crew = state.crew;
}

/** The exterior shows activity for the resolving shift, never the previous command at rest. */
function renderScene() {
  const phase = presentationPhase();
  const active = phase === 'resolving' ? resolvingShift.action : null;
  const scene = el('scene');
  const offline = state.outcome === 'power-failure';
  const alert = phase === 'awaiting' && state.turn === state.alertTurn;
  scene.classList.toggle('has-light', active === 'greenhouse');
  scene.classList.toggle('has-growth', state.lightPeriods > 0);
  scene.classList.toggle('is-sheltered', active === 'shelter');
  scene.classList.toggle('is-conserving', active === 'conserve');
  scene.classList.toggle('low-power', state.battery / initialBattery <= .3);
  scene.classList.toggle('is-alert', alert);
  scene.classList.toggle('crew-emergency', state.crew === 'unsafe');
  scene.classList.toggle('is-offline', offline);
  scene.classList.toggle('is-transitioning', phase === 'resolving');
  scene.dataset.phase = phase;
  scene.dataset.command = active || 'none';
  el('scene-status').textContent = offline ? 'HABITAT / LIFE SUPPORT OFFLINE'
    : state.crew === 'unsafe' ? 'CREW PROTECTION / FAILED'
      : active === 'shelter' ? `SHELTER ACTIVE / SHIFT ${resolvingShift.turn} ONLY`
        : active === 'greenhouse' ? `GROW LIGHTS ON / SHIFT ${resolvingShift.turn}`
          : alert ? 'PARTICLE ALERT / SHELTER REQUIRED' : 'ESSENTIAL SYSTEMS ONLINE';
  el('scene-story').textContent = phase === 'ended' ? outcomeReport() : el('scene-status').textContent;
}

function renderMonitor(phase) {
  const ended = phase === 'ended';
  const alert = phase === 'awaiting' && state.turn === state.alertTurn;
  const last = phase === 'resolving' ? state.log.at(-2) : state.log.at(-1);
  el('monitor-phase').textContent = phase === 'resolving' ? `RESOLVING / SHIFT ${resolvingShift.turn}`
    : ended ? 'MISSION ENDED' : `AWAITING / SHIFT ${state.turn}`;
  el('warning').textContent = getWarning(state);
  if (phase === 'resolving') {
    el('warning').textContent = {
      conserve: 'Life support running. Nonessential systems off.',
      greenhouse: 'Grow lights active for this shift. One light period recorded.',
      shelter: 'Shelter active for this shift only. Crew protected.',
    }[resolvingShift.action];
  } else if (ended) {
    el('warning').textContent = state.outcome === 'power-failure' ? 'LIFE SUPPORT OFFLINE'
      : state.crew === 'unsafe' ? 'CREW PROTECTION FAILED' : '36-HOUR BLACKOUT COMPLETE';
  }
  el('warning').classList.toggle('alert', alert);
  el('warning').classList.toggle('failure', ended && state.crew === 'unsafe');
  el('alert-source').hidden = !alert;
  el('previous-report').hidden = !last;
  el('report-label').textContent = last ? `PREVIOUS SHIFT ${String(last.turn).padStart(2, '0')} / COMPLETE` : '';
  showMonitorMessage(last ? `${ACTIONS[last.action].label}: ${last.cost} kWh used.${last.action === 'greenhouse' ? ' One light period delivered.' : last.action === 'shelter' ? ' Protection ended with that shift.' : ''}` : '');
  const fact = phase === 'awaiting' && !alert ? decisionFact() : '';
  el('decision-fact').textContent = fact;
  el('decision-fact').hidden = !fact;
  el('shift-response').hidden = phase !== 'resolving';
  const debrief = getDebrief(state);
  el('outcome').hidden = !debrief;
  if (debrief) {
    el('outcome-title').textContent = debrief.title.replace(/!$/, '');
    el('debrief').textContent = outcomeReport();
    el('result-stats').textContent = `${state.battery} kWh remaining / ${state.lightPeriods} light periods`;
  } else {
    for (const id of ['outcome-title', 'debrief', 'result-stats']) el(id).textContent = '';
  }
}

/** Render warnings before enabling controls. Resolving and terminal phases block submissions. */
function render() {
  const phase = presentationPhase();
  const displayedTurn = phase === 'resolving' ? resolvingShift.turn : state.turn;
  const ended = phase === 'ended';
  const alert = phase === 'awaiting' && state.turn === state.alertTurn;
  el('command').dataset.phase = phase;
  el('command').dataset.command = phase === 'resolving' ? resolvingShift.action : 'none';
  el('command').dataset.failure = ended && state.crew === 'unsafe';
  el('command').classList.toggle('is-transitioning', phase === 'resolving');
  el('turn').textContent = ended
    ? `${state.log.length} / ${TOTAL_TURNS} shifts complete · mission ended`
    : `Shift ${displayedTurn} / ${TOTAL_TURNS} · hours ${(displayedTurn - 1) * 6}–${displayedTurn * 6}`;
  renderInstruments();
  renderMonitor(phase);
  for (const button of buttons) {
    const action = button.dataset.action;
    const cost = ACTIONS[action].cost;
    button.querySelector('.action-cost').textContent = `${cost} kWh total`;
    button.disabled = phase !== 'awaiting' || state.battery < cost;
    button.classList.toggle('is-executing', phase === 'resolving' && action === resolvingShift.action);
    el(`${action}-reason`).textContent = ended ? 'Mission ended' : phase === 'resolving' ? 'Command in progress'
      : state.battery < cost ? `Unavailable: needs ${cost} kWh; ${state.battery} kWh remains.`
        : `${state.battery - cost} kWh after selection`;
  }
  el('review-briefing').disabled = phase === 'resolving';
  renderScene();
  el('timeline').replaceChildren(...Array.from({ length: TOTAL_TURNS }, (_, index) => {
    const turn = index + 1;
    const entry = state.log.find((move) => move.turn === turn);
    const current = !ended && displayedTurn === turn;
    const item = document.createElement('li');
    item.classList.toggle('done', Boolean(entry) && !(current && phase === 'resolving'));
    item.classList.toggle('current', current);
    item.classList.toggle('alert-turn', alert && turn === state.alertTurn);
    if (current) item.setAttribute('aria-current', 'step');
    item.setAttribute('aria-label', `Shift ${turn}: ${current ? phase === 'resolving' ? 'resolving' : 'awaiting command' : entry ? ACTIONS[entry.action].label + ' complete' : ended ? 'unplayed' : 'upcoming'}`);
    const label = document.createElement('span');
    label.textContent = `0${turn}`;
    const detail = document.createElement('small');
    detail.textContent = current ? phase === 'resolving' ? 'Running' : 'Current' : entry ? 'Done' : ended ? 'Unplayed' : `${(turn - 1) * 6}–${turn * 6} h`;
    item.append(label, detail);
    return item;
  }));
  el('log-count').textContent = `${state.log.length} / ${TOTAL_TURNS}`;
  el('log').replaceChildren(...state.log.map((entry) => {
    const item = document.createElement('li');
    item.textContent = `Shift ${entry.turn}: ${ACTIONS[entry.action].label}, ${entry.cost} kWh.${phase === 'resolving' && entry === resolvingShift ? ' Resolving.' : ''}`;
    return item;
  }));
  if (ended) el('outcome-title').focus();
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
  el('launch').hidden = screen !== 'launch';
  el('briefing').hidden = screen !== 'briefing';
  el('command').hidden = screen !== 'game';
  el('mission').hidden = screen !== 'game';
  for (const id of ['masthead', 'scene', 'source-footer']) el(id).hidden = screen !== 'game';
  document.querySelector('.skip-link').hidden = screen !== 'game';
}

function completeTransmission() {
  cancelAnimationFrame(revealFrame);
  revealing = false;
  el('transmission-text').textContent = transmissions[transmissionIndex].text;
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
    ? reviewing ? 'Return to Mission' : 'Assume Command' : 'Next Transmission >';
  el('transmission-text').textContent = '';
  el('transmission-cursor').hidden = false;
  if (reducedMotion.matches) { completeTransmission(); return; }
  revealing = true;
  const started = performance.now();
  // Receiving text never advances a transmission. Click or keyboard input can finish it.
  const duration = Math.min(4000, message.text.length * 18);
  function reveal(now) {
    const count = Math.floor(message.text.length * Math.min(1, (now - started) / duration));
    el('transmission-text').textContent = message.text.slice(0, count);
    if (count === message.text.length) completeTransmission();
    else revealFrame = requestAnimationFrame(reveal);
  }
  revealFrame = requestAnimationFrame(reveal);
}

function openBriefing(review = false) {
  completeMonitorMessage();
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
  el('mission-title').textContent = 'Lunar operations';
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
el('transmission-body').addEventListener('click', () => {
  if (revealing) completeTransmission();
});
el('transmission-body').addEventListener('keydown', (event) => {
  if (revealing && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    completeTransmission();
  }
});
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
  resetPresentation();
  state = retry(events);
  takeCommand();
});

// Retry cancels both timers and text reveals. No callback from the old mission survives.
function resetPresentation() {
  clearTimeout(shiftTimer);
  shiftTimer = 0;
  resolvingShift = null;
  focusAfterShift = null;
  completeMonitorMessage();
  monitorMessage = '';
  el('feedback').textContent = '';
  el('feedback-readable').textContent = '';
}

/** Finish only presentation. Simulation time and resources were already committed once. */
function finishShift() {
  if (!resolvingShift) return;
  clearTimeout(shiftTimer);
  shiftTimer = 0;
  resolvingShift = null;
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
    if (resolvingShift || state.outcome || button.disabled || event.detail > 1) return;
    const previous = state;
    const next = chooseAction(state, button.dataset.action);
    state = next;
    // Rejected commands and immediate failures have no successful shift to animate.
    if (next.log.length === previous.log.length || next.outcome || reducedMotion.matches) {
      render();
      if (!state.outcome && state.turn === state.alertTurn) el('warning').focus();
      return;
    }
    resolvingShift = next.log.at(-1);
    focusAfterShift = button;
    render();
    // Shift number, timeline and incoming alert update only after this visual interval.
    shiftTimer = setTimeout(finishShift, 1000);
    el('skip-shift').focus({ preventScroll: true });
  });
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    completeMonitorMessage();
    finishShift();
  }
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
