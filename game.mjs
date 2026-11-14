/** Pure six-turn simulation. No DOM, network, clock, or mutable global state. */
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
    feedback: 'Command is yours. Choose how to spend energy for the next 6 hours.',
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
  if (state.outcome) return 'Mission ended. Read your debrief below.';
  return state.turn === state.alertTurn
    ? 'Particle alert this turn! Choose Shelter now to keep the crew safe. Earlier shelter does not count.'
    : 'No particle alert this turn. Shelter protects only the turn when you choose it.';
}

/** Funded choices on the alert must be Shelter. Failed choices spend nothing. */
export function chooseAction(state, action) {
  const ready = beforeTurn(state);
  if (ready.outcome) return ready;
  const move = ACTIONS[action];
  if (!move) return { ...ready, feedback: 'Choose one of the three mission actions.' };
  if (ready.battery < move.cost) {
    return { ...ready, feedback: `${move.label} needs ${move.cost} kWh. You have ${ready.battery} kWh.` };
  }
  if (ready.turn === ready.alertTurn && action !== 'shelter') {
    return { ...ready, crew: 'unsafe', outcome: 'missed-shelter',
      feedback: 'The crew missed shelter. No energy was spent on this choice.' };
  }
  const next = {
    ...ready, battery: ready.battery - move.cost,
    lightPeriods: ready.lightPeriods + (action === 'greenhouse' ? 1 : 0),
    log: [...ready.log, { turn: ready.turn, action, cost: move.cost }],
    feedback: `Turn ${ready.turn}: ${move.label} used ${move.cost} kWh.${action === 'greenhouse' ? ' Added 1 light period.' : ''}${action === 'shelter' ? ' Crew sheltered for that turn only.' : ''}`,
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
    case 'full-win': return { title: 'Mission complete!', text: `Your crew is safe, and the greenhouse received ${state.lightPeriods} light periods. Sheltering on turn ${state.alertTurn} was the key safety choice. Next time, keep that shelter plan and check your energy before every move.` };
    case 'partial-success': return { title: 'Partial success', text: `You survived all 36 hours with a safe crew, but delivered ${state.lightPeriods} of 2 needed light periods. Choosing fewer than two Greenhouse turns left the plants short. Next time, budget for two Greenhouse turns and one alert-turn Shelter.` };
    case 'missed-shelter': return { title: 'Mission ended: missed shelter', text: `The non-Shelter choice on turn ${state.alertTurn} left the crew unsafe. Next time, choose Shelter when the particle warning appears, even if you sheltered earlier.` };
    case 'shelter-power-shortfall': return { title: 'Mission ended: shelter power shortfall', text: `You reached the alert with only ${state.battery} kWh, below Shelter's 18 kWh cost. Next time, conserve earlier so at least 18 kWh remains for the alert.` };
    case 'power-failure': return { title: 'Mission ended: power failure', text: `Only ${state.battery} kWh remained before turn ${state.turn}. Life support needs 12 kWh. Extra 18 kWh actions used the reserve. Next time, plan two Greenhouse turns, one alert-turn Shelter, and three Conserve turns.` };
    default: return null;
  }
}
