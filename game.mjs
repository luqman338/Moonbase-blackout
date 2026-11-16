/** Pure six-turn simulation. No DOM, network, clock, or mutable global state. */
// AI-assisted development: OpenAI Codex contributed implementation.
// Project roles and human direction/review: README.md, People and AI assistance.
export const ACTIONS = Object.freeze({
  conserve: Object.freeze({ label: 'Conserve', cost: 12 }),
  greenhouse: Object.freeze({ label: 'Greenhouse', cost: 18 }),
  shelter: Object.freeze({ label: 'Shelter', cost: 18 }),
});
export const TOTAL_TURNS = 6;
const HOUR = 60 * 60 * 1000;

/** UTC observations set the alert timing inside a fictional clock offset. */
export function getTiming(events) {
  const flare = Date.parse(events.flare.beginTime);
  const sep = Date.parse(events.sep.eventTime);
  if (!Number.isFinite(flare) || !Number.isFinite(sep)) {
    throw new Error('NASA timing data is missing or invalid.');
  }
  const start = flare - 12 * HOUR;
  const elapsed = sep - start;
  const alertTurn = 1 + Math.floor(elapsed / (6 * HOUR));
  if (alertTurn < 1 || alertTurn > TOTAL_TURNS) throw new Error('Alert falls outside mission.');
  return { fictionalScenarioStart: new Date(start).toISOString(), elapsedMinutes: elapsed / 60000, alertTurn };
}

export function createGame(events) {
  return {
    scenario: 'May 2024', ...getTiming(events), turn: 1, battery: 92,
    lightPeriods: 0, crew: 'safe', outcome: null, log: [],
    feedback: 'You are in charge. Choose power use for six hours.',
  };
}

/** Retry always starts May again. Briefing visibility belongs to the UI. */
export function retry(events) { return createGame(events); }

/** Check essentials first, then shelter power. Completion never checks turn 7. */
export function beforeTurn(state) {
  if (state.outcome) return state;
  if (state.battery < 12) return { ...state, crew: 'unsafe', outcome: 'power-failure' };
  if (state.turn === state.alertTurn && state.battery < 18) {
    return { ...state, crew: 'unsafe', outcome: 'shelter-power-shortfall' };
  }
  return state;
}

export function getWarning(state) {
  if (state.outcome) return 'Mission over. Read your report.';
  return state.turn === state.alertTurn
    ? 'Danger from the Sun! Choose Shelter now. Shelter from an earlier shift will not help.'
    : 'No Sun danger this shift. Shelter works for one shift only.';
}

/** Funded choices on the alert must be Shelter. Failed choices spend nothing. */
export function chooseAction(state, action) {
  const ready = beforeTurn(state);
  if (ready.outcome) return ready;
  const move = ACTIONS[action];
  if (!move) return { ...ready, feedback: 'Choose Conserve, Greenhouse or Shelter.' };
  if (ready.battery < move.cost) {
    return { ...ready, feedback: `${move.label} needs ${move.cost} kWh. You have ${ready.battery} kWh.` };
  }
  if (ready.turn === ready.alertTurn && action !== 'shelter') {
    return { ...ready, crew: 'unsafe', outcome: 'missed-shelter',
      feedback: 'The crew missed shelter. This choice used no power.' };
  }
  const next = {
    ...ready, battery: ready.battery - move.cost,
    lightPeriods: ready.lightPeriods + (action === 'greenhouse' ? 1 : 0),
    log: [...ready.log, { turn: ready.turn, action, cost: move.cost }],
    feedback: `Shift ${ready.turn}: ${move.label} used ${move.cost} kWh.${action === 'greenhouse' ? ' Plants got one shift of light.' : ''}${action === 'shelter' ? ' Crew stayed in shelter for that shift.' : ''}`,
  };
  // Six completed moves end the blackout, even with less than 12 kWh left.
  if (ready.turn === TOTAL_TURNS) {
    next.outcome = next.crew === 'safe' && next.lightPeriods >= 2 ? 'full-win' : 'partial-success';
    return next;
  }
  next.turn += 1;
  return beforeTurn(next);
}

/** Explain the decisive choice and one useful action for the next attempt. */
export function getDebrief(state) {
  switch (state.outcome) {
    case 'full-win': return { title: 'Mission complete!', text: `The crew is safe. Plants got ${state.lightPeriods} shifts of light. You used Shelter on shift ${state.alertTurn}. Check your power before each choice next time too.` };
    case 'partial-success': return { title: 'Crew safe. Plants need light.', text: `The crew is safe after 36 hours. Plants got ${state.lightPeriods} of 2 light shifts. Try again. Save power for two Greenhouse shifts and Shelter when warned.` };
    case 'missed-shelter': return { title: 'Mission over: missed shelter', text: `The crew missed shelter on shift ${state.alertTurn}. Choose Shelter when warned. Shelter from an earlier shift will not help.` };
    case 'shelter-power-shortfall': return { title: 'Not enough power for Shelter', text: `You had ${state.battery} kWh. Shelter needs 18 kWh. Try saving more power before the warning.` };
    case 'power-failure': return { title: 'Mission over: not enough power', text: `You had ${state.battery} kWh before shift ${state.turn}. The crew needs 12 kWh for air and heat. Try saving more power for later shifts.` };
    default: return null;
  }
}

/** Lessons link game outcomes to planning without claiming real mission rules. */
export function getMissionLesson(state) {
  switch (state.outcome) {
    case 'full-win': return 'Your plan kept the crew safe and lit the plants. Real space crews must plan their power use too.';
    case 'partial-success': return 'You kept the crew safe, but plants needed more light. Real space crews must plan for more than one need.';
    case 'missed-shelter': return 'The crew missed shelter when danger came. Real space crews must take safety steps at the right time.';
    case 'power-failure': return 'Your choices left too little power for air and heat. Real space crews must save power for later needs.';
    case 'shelter-power-shortfall': return 'Too little power was left for Shelter when needed. Real space crews must plan power for safety too.';
    default: return '';
  }
}
