/** DOM adapter: archive provenance, terminal screens and a phase-driven command console. */
// AI-assisted development: OpenAI Codex contributed implementation and debugging.
// Project roles and human direction/review: README.md, People and AI assistance.
import { ACTIONS, TOTAL_TURNS, createGame, retry, chooseAction, getWarning, getDebrief, getMissionLesson } from './game.mjs';

import { storySections, projectLinks, editorial } from './mission-story.mjs';

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
let transitionStage = '';
let startingBattery = 92;
// Real-world presentation only: 0.65 s acknowledgement, 2.6 s operation, 3.5 s transmission.
const DECISION_TIMING = Object.freeze({ acknowledgement: 650, operation: 2600, transmission: 3500 });

// The simulation commits immediately. This phase only controls presentation and input.
// Even terminal outcomes wait for the player to finish reading the final transmission.
function presentationPhase() {
  return resolvingShift ? 'resolving' : state.outcome ? 'ended' : 'awaiting';
}

function outcomeReport() {
  switch (state.outcome) {
    case 'full-win': return `All 36 hours done. Crew safe. Plants got ${state.lightPeriods} shifts of light.`;
    case 'partial-success': return `All 36 hours done. Crew safe. Plants got ${state.lightPeriods} of 2 light shifts.`;
    case 'missed-shelter': return `The crew missed shelter on shift ${state.alertTurn}. The crew is not safe. That choice used no power.`;
    case 'shelter-power-shortfall': return `You had ${state.battery} kWh. Shelter needs 18 kWh this shift. The crew is not safe.`;
    case 'power-failure': return `You had ${state.battery} kWh before shift ${state.turn}. Air and heat need 12 kWh. They stopped working.`;
    default: return '';
  }
}

function completeMonitorMessage() {
  cancelAnimationFrame(monitorFrame);
  monitorFrame = 0;
  el('feedback').textContent = monitorMessage;
  el('monitor-cursor').hidden = true;
  if (document.body.dataset.screen === 'report' && state?.outcome) el('debrief').textContent = outcomeReport();
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
  const duration = resolvingShift && transitionStage === 'transmission' ? DECISION_TIMING.transmission : Math.min(600, message.length * 8);
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
  if (state.battery < ACTIONS.greenhouse.cost) return `Only Conserve fits your power left. You have ${state.battery} kWh.`;
  if (lightsNeeded > shiftsLeft) return `${shiftsLeft} shifts remain. There is no time left for two light shifts.`;
  if (lightsNeeded && shiftsLeft <= 2) return `Plants need ${lightsNeeded} more ${lightsNeeded === 1 ? 'shift' : 'shifts'} of light.`;
  if (state.lightPeriods >= 2) return 'Plants have enough light. Greenhouse still costs 18 kWh.';
  return '';
}

/** Instruments always use committed resources. Activity lamps use only the resolving phase. */
function renderInstruments() {
  const phase = presentationPhase();
  const ready = transitionStage === 'ready';
  const active = phase === 'resolving' && transitionStage !== 'acknowledged' ? resolvingShift.action : null;
  const alert = phase === 'resolving' ? resolvingShift.turn === state.alertTurn : phase === 'awaiting' && state.turn === state.alertTurn;
  const displayedBattery = phase === 'resolving' && transitionStage === 'acknowledged' ? startingBattery : state.battery;
  const percentage = Math.round(displayedBattery / initialBattery * 100);
  el('battery').textContent = `${displayedBattery} kWh`;
  el('battery-percent').textContent = `${percentage}%`;
  el('battery-fill').style.width = `${displayedBattery / initialBattery * 100}%`;
  el('battery-meter').setAttribute('aria-valuemax', initialBattery);
  el('battery-meter').setAttribute('aria-valuenow', displayedBattery);
  el('battery-meter').setAttribute('aria-valuetext', `${displayedBattery} kWh, ${percentage} percent`);
  el('battery-meter').classList.toggle('low', percentage <= 30);
  el('crew').textContent = state.crew === 'unsafe' ? 'Crew not safe' : alert && phase === 'awaiting' ? 'Crew in danger' : 'Crew safe';
  el('shelter-status').hidden = alert && phase === 'awaiting';
  el('shelter-status').textContent = state.crew === 'unsafe' ? 'Crew not safe. Mission ended.'
    : active === 'shelter' ? `Shelter ${ready ? 'complete' : 'on'} / shift ${resolvingShift.turn}`
      : alert && !state.outcome ? 'Use Shelter this shift' : 'Shelter off';
  el('greenhouse').textContent = state.lightPeriods >= 2 ? 'Goal met!' : `${state.lightPeriods} of 2`;
  el('plant-status').textContent = state.lightPeriods >= 2 ? 'Plants got enough light!' : `Give plants light ${2 - state.lightPeriods} more ${state.lightPeriods === 1 ? 'time' : 'times'}.`;
  el('light-status').textContent = active === 'greenhouse' ? ready ? `Light shift ${resolvingShift.turn} complete` : `Grow lights on / shift ${resolvingShift.turn}` : 'Grow lights off';
  el('light-status').hidden = active !== 'greenhouse';
  [...document.querySelectorAll('.light-periods span')].forEach((lamp, index) => lamp.classList.toggle('lit', state.lightPeriods > index));
  document.body.dataset.crew = state.crew === 'unsafe' ? 'unsafe' : alert && phase === 'awaiting' ? 'danger' : 'safe';
}

/** The exterior shows activity for the resolving shift, never the previous command at rest. */
function renderScene() {
  const phase = presentationPhase();
  const active = phase === 'resolving' && transitionStage !== 'acknowledged' ? resolvingShift.action : null;
  const scene = el('scene');
  const offline = state.outcome === 'power-failure';
  const alert = phase === 'resolving' ? resolvingShift.turn === state.alertTurn : phase === 'awaiting' && state.turn === state.alertTurn;
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
  el('scene-status').textContent = offline ? 'BASE / AIR AND HEAT OFF'
    : state.crew === 'unsafe' ? 'CREW / NOT SAFE'
      : active === 'shelter' ? `SHELTER ON / SHIFT ${resolvingShift.turn} ONLY`
        : active === 'greenhouse' ? `GROW LIGHTS ON / SHIFT ${resolvingShift.turn}`
          : alert ? 'SUN DANGER / USE SHELTER' : 'AIR AND HEAT ON';
  el('scene-story').textContent = phase === 'ended' ? outcomeReport() : el('scene-status').textContent;
}

function renderMonitor(phase) {
  const ended = phase === 'ended';
  const alert = phase === 'resolving' ? resolvingShift.turn === state.alertTurn : phase === 'awaiting' && state.turn === state.alertTurn;
  el('safety-warning').hidden = !alert;
  // Change live-region text only when its message changes, not on every redraw.
  if (phase === 'resolving') {
    el('monitor-phase').textContent = `${({ acknowledged: 'CHOICE RECEIVED', response: 'SYSTEM RUNNING', transmission: 'SHIFT REPORT', ready: 'READY' })[transitionStage]} / SHIFT ${resolvingShift.turn}`;
    const warning = alert ? state.crew === 'unsafe' ? 'The crew missed Shelter.' : 'The crew is in Shelter this shift.' : '';
    if (el('warning').textContent !== warning) el('warning').textContent = warning;
    el('warning').classList.toggle('alert', alert);
    el('warning').classList.toggle('failure', Boolean(state.outcome && state.crew === 'unsafe'));
    el('previous-report').hidden = false;
    el('report-label').textContent = `SHIFT ${String(resolvingShift.turn).padStart(2, '0')} / ${resolvingShift.cost} kWh USED`;
    el('decision-fact').hidden = true;
    el('shift-response').hidden = false;
    el('skip-shift').hidden = transitionStage === 'ready';
    el('continue-shift').hidden = transitionStage !== 'ready';
    el('continue-shift').textContent = state.outcome ? 'READ MISSION REPORT' : `CONTINUE TO SHIFT ${String(state.turn).padStart(2, '0')}`;
    return;
  }
  const last = phase === 'resolving' ? state.log.at(-2) : state.log.at(-1);
  el('monitor-phase').textContent = phase === 'resolving' ? `RUNNING / SHIFT ${resolvingShift.turn}`
    : ended ? 'MISSION ENDED' : `CHOOSE / SHIFT ${state.turn}`;
  if (alert) {
    const warning = 'Sun danger! Choose Shelter now!';
    if (el('warning').textContent !== warning) el('warning').textContent = warning;
  } else if (el('warning').textContent !== getWarning(state)) el('warning').textContent = getWarning(state);
  if (phase === 'resolving') {
    el('warning').textContent = {
      conserve: 'Air and heat on. Other systems off.',
      greenhouse: 'Plant lights on. One light shift added.',
      shelter: 'Shelter on for this shift. Crew safe.',
    }[resolvingShift.action];
  } else if (ended) {
    el('warning').textContent = state.outcome === 'power-failure' ? 'AIR AND HEAT OFF'
      : state.crew === 'unsafe' ? 'CREW NOT SAFE' : '36-HOUR BLACKOUT OVER';
  }
  el('warning').classList.toggle('alert', alert);
  el('warning').classList.toggle('failure', ended && state.crew === 'unsafe');
  el('previous-report').hidden = !last;
  el('report-label').textContent = last ? `PREVIOUS SHIFT ${String(last.turn).padStart(2, '0')} / COMPLETE` : '';
  showMonitorMessage(last ? `${ACTIONS[last.action].label}: ${last.cost} kWh used.${last.action === 'greenhouse' ? ' Plants got one shift of light.' : last.action === 'shelter' ? ' Shelter ended with that shift.' : ''}` : '');
  const fact = phase === 'awaiting' && !alert ? decisionFact() : '';
  el('decision-fact').textContent = fact;
  el('decision-fact').hidden = !fact;
  el('shift-response').hidden = phase !== 'resolving';
  const debrief = getDebrief(state);
  el('outcome').hidden = !debrief;
  if (debrief) {
    el('outcome-title').textContent = debrief.title.replace(/!$/, '');
    el('debrief').textContent = outcomeReport();
    el('result-stats').textContent = `${state.battery} kWh left / ${state.lightPeriods} plant light shifts`;
  } else {
    for (const id of ['outcome-title', 'debrief', 'result-stats']) el(id).textContent = '';
  }
}

/** Render warnings before enabling controls. Resolving and terminal phases block submissions. */
function render() {
  const phase = presentationPhase();
  // Resources are already committed. Ready waits only for the player's acknowledgement.
  const ready = phase === 'resolving' && transitionStage === 'ready';
  const displayedTurn = phase === 'resolving' ? resolvingShift.turn : state.turn;
  const ended = phase === 'ended';
  const alert = phase === 'resolving' ? resolvingShift.turn === state.alertTurn : phase === 'awaiting' && state.turn === state.alertTurn;
  el('command').dataset.phase = phase;
  el('command').dataset.stage = transitionStage;
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
    button.classList.toggle('is-executing', phase === 'resolving' && !ready && action === resolvingShift.action);
    el(`${action}-reason`).textContent = ended ? 'Mission ended'
      : ready ? state.crew === 'unsafe' ? 'Mission failed' : action === resolvingShift.action ? 'Choice complete' : state.outcome ? 'Mission ended' : 'Ready to continue'
        : phase === 'resolving' ? 'Choice running'
      : state.battery < cost ? `Not enough power. Needs ${cost} kWh. ${state.battery} kWh left.`
        : alert && action !== 'shelter' ? 'Crew will be unsafe. Mission ends.'
        : `${state.battery - cost} kWh left after this choice`;
  }
  el('review-briefing').disabled = phase === 'resolving';
  el('story-game').disabled = phase === 'resolving';
  renderScene();
  el('timeline').replaceChildren(...Array.from({ length: TOTAL_TURNS }, (_, index) => {
    const turn = index + 1;
    const entry = state.log.find((move) => move.turn === turn);
    const current = !ended && displayedTurn === turn;
    const item = document.createElement('li');
    item.classList.toggle('done', Boolean(entry) && !(current && phase === 'resolving' && !ready));
    item.classList.toggle('current', current);
    item.classList.toggle('alert-turn', alert && turn === state.alertTurn);
    if (current) item.setAttribute('aria-current', 'step');
    item.setAttribute('aria-label', `Shift ${turn}: ${current ? phase === 'resolving' ? ready ? entry ? ACTIONS[entry.action].label + ' complete' : 'failed' : 'running' : 'choose a command' : entry ? ACTIONS[entry.action].label + ' complete' : ended ? 'not played' : 'next'}`);
    const label = document.createElement('span');
    label.textContent = `0${turn}`;
    const detail = document.createElement('small');
    detail.textContent = current ? phase === 'resolving' ? ready ? entry ? 'Done' : 'Failed' : 'Running' : 'Current' : entry ? 'Done' : ended ? 'Not played' : `${(turn - 1) * 6}–${turn * 6} h`;
    item.append(label, detail);
    return item;
  }));
  el('log-count').textContent = `${state.log.length} / ${TOTAL_TURNS}`;
  el('log').replaceChildren(...state.log.map((entry) => {
    const item = document.createElement('li');
    item.textContent = `Shift ${entry.turn}: ${ACTIONS[entry.action].label}, ${entry.cost} kWh.${phase === 'resolving' && !ready && entry === resolvingShift ? ' Running.' : ''}`;
    return item;
  }));

}

// Intro state belongs only to this adapter. No transmission consumes mission time.
const transmissions = [
  { title: 'You are in charge', text: 'MISSION CONTROL: Our Moon base has lost solar power. That means power from the Sun. You are in charge. The crew is your space team. Keep them safe until power returns.' },
  { title: 'One battery', text: 'The blackout lasts 36 hours. You have six shifts, each six hours long. Your battery holds 92 kWh. A kWh is a unit of energy. The battery cannot charge during this mission.' },
  { title: 'Choose one command', text: 'Choose one command each shift. Conserve saves power: 12 kWh. Greenhouse runs lights in the plant room: 18 kWh. Shelter powers a safer room: 18 kWh. All three run life support: air and heat for the crew.' },
  { title: 'Watch for danger', text: 'The plants need two shifts of light. Watch for a particle alert. Tiny bits from the Sun can harm the crew. Choose Shelter when that warning comes. The safer room protects the crew for one shift only.' },
  { title: 'Plan for now and later', text: 'Real space crews have limited power, food and supplies. They plan what to use now and what to save. This game lets you try a simple version. Check power, plants and warnings before each choice. Select Take Command to start.' },
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
  el('mission-story').hidden = screen !== 'story';
  el('mission-report').hidden = screen !== 'report';
  el('launch').hidden = screen !== 'launch';
  el('briefing').hidden = screen !== 'briefing';
  el('command').hidden = screen !== 'game';
  el('mission').hidden = screen !== 'game';
  for (const id of ['masthead', 'scene']) el(id).hidden = screen !== 'game';
  document.querySelector('.skip-link').hidden = screen !== 'game';
}

function completeTransmission() {
  cancelAnimationFrame(revealFrame);
  revealing = false;
  el('transmission-text').textContent = transmissions[transmissionIndex].text;
  el('next-transmission').textContent = transmissionIndex === transmissions.length - 1
    ? reviewing ? 'Return to Mission' : 'Take Command' : 'Next Message >';
}

function showTransmission() {
  cancelAnimationFrame(revealFrame);
  const message = transmissions[transmissionIndex];
  el('transmission-body').scrollTop = 0;
  el('transmission-title').textContent = message.title;
  el('transmission-count').textContent = `${String(transmissionIndex + 1).padStart(2, '0')}/05`;
  el('transmission-id').textContent = `MB-0${transmissionIndex + 1} / ${reviewing ? 'MISSION HELP' : 'YOUR MISSION'}`;
  el('transmission-readable').textContent = message.text;
  el('next-transmission').textContent = 'Show Full Message';
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
  el('mission-title').textContent = 'Moon base';
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
  transitionStage = '';
  focusAfterShift = null;
  completeMonitorMessage();
  monitorMessage = '';
  el('feedback').textContent = '';
  el('feedback-readable').textContent = '';
}

/** All timers finish visuals only. Advancement is always an explicit player action. */
function commandResult() {
  if (!resolvingShift.action) return outcomeReport();
  return `${ACTIONS[resolvingShift.action].label}: ${resolvingShift.cost} kWh used. ` + ({
    conserve: 'Air and heat stayed on. Other systems stayed off.',
    greenhouse: 'Plants got one shift of light.',
    shelter: 'Crew stayed in shelter for this shift.',
  }[resolvingShift.action]) + (state.outcome ? ` ${outcomeReport()}` : '');
}

function readyToContinue() {
  if (!resolvingShift) return;
  transitionStage = 'ready';
  completeMonitorMessage();
  render();
  el('continue-shift').focus({ preventScroll: true });
}

function revealCommandResult() {
  if (!resolvingShift) return;
  transitionStage = 'transmission';
  render();
  showMonitorMessage(commandResult());
  // The full transmission finishes before the player can advance.
  shiftTimer = setTimeout(readyToContinue, DECISION_TIMING.transmission);
}

function skipAnimation() {
  if (!resolvingShift || transitionStage === 'ready') return;
  clearTimeout(shiftTimer);
  showMonitorMessage(commandResult());
  readyToContinue();
}

function openMissionReport() {
  completeMonitorMessage();
  setScreen('report');
  const partial = state.outcome === 'partial-success';
  el('mission-report').dataset.result = partial ? 'partial' : state.crew === 'unsafe' ? 'failure' : 'success';
  el('outcome-title').textContent = state.outcome === 'full-win' ? 'MISSION COMPLETE' : partial ? 'CREW SAFE. PLANTS NEED LIGHT.' : 'MISSION FAILED';
  const summary = outcomeReport();
  el('report-readable').textContent = summary;
  el('debrief').textContent = summary;
  if (!reducedMotion.matches) {
    const started = performance.now();
    function revealReport(now) {
      const progress = Math.min(1, (now - started) / 700);
      el('debrief').textContent = summary.slice(0, Math.floor(summary.length * progress));
      if (progress < 1) monitorFrame = requestAnimationFrame(revealReport);
    }
    monitorFrame = requestAnimationFrame(revealReport);
  }
  el('result-stats').textContent = `${state.crew === 'safe' ? 'Crew safe' : 'Crew not safe'} / Power left: ${state.battery} kWh / Plant light shifts: ${state.lightPeriods}/2 / ${state.log.length} of ${TOTAL_TURNS} shifts completed`;
  const shelter = state.log.find(entry => entry.turn === state.alertTurn && entry.action === 'shelter');
  const lights = state.log.filter(entry => entry.action === 'greenhouse').map(entry => entry.turn);
  el('critical-decisions').textContent = `Warning on shift ${state.alertTurn}: ${shelter ? 'crew in Shelter.' : 'crew not sheltered.'} Plant lights ran on shifts: ${lights.length ? lights.join(', ') : 'none'}.`;
  const advice = state.outcome === 'partial-success' ? 'Try again. Save power and time for two Greenhouse shifts.'
    : state.outcome === 'missed-shelter' ? 'Try again. Choose Shelter when warned. Earlier shelter will not help.'
      : state.crew === 'unsafe' ? 'Try again. Check each cost. Save power for air, heat and Shelter.' : '';
  el('recommendation').textContent = advice || 'Keep checking power and warnings with each choice.';
  el('recommendation').hidden = false;
  el('report-why').textContent = state.outcome === 'missed-shelter' ? `You did not choose Shelter on shift ${state.alertTurn}. Earlier shelter cannot protect a later shift.`
    : state.outcome === 'power-failure' ? `Your choices left ${state.battery} kWh before shift ${state.turn}. Air and heat need 12 kWh each shift.`
      : state.outcome === 'shelter-power-shortfall' ? 'There was not enough power for Shelter. It needs 18 kWh.'
        : partial ? `You chose Greenhouse ${lights.length} times. The plants needed at least two.`
          : 'You finished six shifts. You used Shelter when warned. Plants got enough light.';
  el('mission-lesson').textContent = getMissionLesson(state);
  el('report-log').replaceChildren(...[...el('log').children].map(node => node.cloneNode(true)));
  el('report-decisions').open = false;
  el('outcome-title').focus();
  window.scrollTo(0, 0);
}

el('skip-shift').addEventListener('click', skipAnimation);
el('continue-shift').addEventListener('click', () => {
  if (!resolvingShift || transitionStage !== 'ready') return;
  resetPresentation();
  if (state.outcome) { render(); openMissionReport(); return; }
  render();
  if (state.turn === state.alertTurn) el('warning').focus();
  else buttons.find(button => !button.disabled)?.focus({ preventScroll: true });
});
el('report-retry').addEventListener('click', () => el('retry').click());
for (const button of buttons) {
  button.addEventListener('keydown', event => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  button.addEventListener('click', event => {
    if (resolvingShift || state.outcome || button.disabled || event.detail > 1) return;
    const previous = state;
    const next = chooseAction(state, button.dataset.action);
    state = next;
    const accepted = next.log.length > previous.log.length;
    if (!accepted && !next.outcome) { render(); return; }
    startingBattery = previous.battery;
    resolvingShift = accepted ? next.log.at(-1) : { turn: previous.turn, action: null, cost: 0 };
    focusAfterShift = button;
    transitionStage = 'acknowledged';
    showMonitorMessage('');
    render();
    if (reducedMotion.matches) { skipAnimation(); return; }
    shiftTimer = setTimeout(() => {
      transitionStage = 'response';
      render();
      shiftTimer = setTimeout(revealCommandResult, DECISION_TIMING.operation);
    }, DECISION_TIMING.acknowledgement);
    el('skip-shift').focus({ preventScroll: true });
  });
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { completeMonitorMessage(); skipAnimation(); }
});

// Documentation is a view over static content. It never calls a simulation transition.
let storyReturn = null;
for (const [key, label] of [['demo', 'Play Moonbase Blackout'], ['repository', 'Code repository'], ['challenge', 'Official challenge']]) {
  const link = document.createElement('a');
  link.href = projectLinks[key];
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  if (key === 'demo') link.className = 'terminal-button story-primary-link';
  el('story-links').append(link);
}
const contents = document.createElement('ol');
for (const [index, section] of storySections.entries()) {
  const article = document.createElement('section');
  article.id = `story-${section.id}`;
  const heading = document.createElement('h3');
  heading.tabIndex = -1;
  heading.textContent = `${String(index + 1).padStart(2, '0')} / ${section.title}`;
  article.append(heading);
  const body = document.createElement('div');
  // Trusted, locally authored markup only. NASA fields and editable credit text use textContent.
  body.innerHTML = section.body;
  article.append(body);
  el('story-sections').append(article);
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = `#${article.id}`;
  link.textContent = section.title;
  link.addEventListener('click', event => {
    event.preventDefault();
    article.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  });
  item.append(link); contents.append(item);
}
el('story-toc').append(contents);
// Keep data-backed provenance next to the plain-language science explanation.
el('story-science').append(el('source-footer'));
// Confirmed people and roles are included in the supporting narrative above.
for (const observation of editorial.playtesting) {
  const p = document.createElement('p');
  p.textContent = observation;
  el('story-validation').append(p);
}
for (const credit of editorial.mediaCredits) {
  const p = document.createElement('p'); p.textContent = credit;
  el('story-credits').append(p);
}
for (const id of ['story-launch', 'story-game', 'story-report']) {
  el(id).addEventListener('click', () => {
    if (resolvingShift || document.body.dataset.screen === 'story') return;
    completeMonitorMessage();
    storyReturn = { screen: document.body.dataset.screen, scroll: window.scrollY, trigger: el(id) };
    el('story-back').textContent = storyReturn.screen === 'report' ? 'Back to Report' : storyReturn.screen === 'launch' ? 'Back to Launch' : 'Back to Mission';
    setScreen('story');
    document.querySelector('.story-scroll').scrollTop = 0;
    window.scrollTo(0, 0);
    el('story-title').focus();
  });
}
el('story-back').addEventListener('click', () => {
  if (!storyReturn) return;
  const saved = storyReturn;
  storyReturn = null;
  setScreen(saved.screen);
  window.scrollTo(0, saved.scroll);
  saved.trigger.focus({ preventScroll: true });
});

// Relative data paths work in a local preview and below a repository URL prefix.
try {
  const response = await fetch('./data/events.json');
  if (!response.ok) throw new Error(`Mission data returned HTTP ${response.status}.`);
  events = await response.json();
  state = createGame(events);
  initialBattery = state.battery;
  el('timing').textContent = `A fictional 12-hour offset before the supplied flare start places the mission start at ${state.fictionalScenarioStart.replace('.000Z', 'Z')}. The archived particle observation follows ${Math.floor(state.elapsedMinutes / 60)} hours ${state.elapsedMinutes % 60} minutes later. With six-hour shifts (21,600,000 milliseconds), the alert appears before the shift-${state.alertTurn} choice.`;
  el('source-observation').textContent = `Recorded NASA SEP event: ${events.sep.sepID}. Observation time: ${events.sep.eventTime}. Instrument: ${events.sep.instruments.map((instrument) => instrument.displayName).join(', ')}. Retrieved: ${events.provenance.retrievedOn}.`;
  el('flare-source').textContent = `Linked flare ID: ${events.flare.flrID}. Supplied flare start: ${events.flare.beginTime}. ${events.provenance.flareProvenance}`;
  el('load-status').textContent = '';
  el('start').disabled = false;
} catch (error) {
  el('load-status').textContent = 'The mission could not load. Check your internet and reload. If it still fails, ask an adult for help.';
}
