/** Dependency-free tests using the same curated timestamps as the browser. */
// AI-assisted development: OpenAI Codex contributed these tests.
// Project roles and human direction/review: README.md, People and AI assistance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, retry, chooseAction, getTiming, getWarning } from './game.mjs';
const events = JSON.parse(await readFile(new URL('./data/events.json', import.meta.url)));
const moves = { C: 'conserve', G: 'greenhouse', S: 'shelter' };
function play(sequence) {
  return sequence.split(' ').reduce((s, letter) => chooseAction(s, moves[letter]), createGame(events));
}
test('C C S G G C: full win, 2 kWh, safe crew, two lights, alert 3', () => {
  const s = play('C C S G G C');
  assert.equal(s.outcome, 'full-win');
  assert.equal(s.battery, 2);
  assert.equal(s.alertTurn, 3);
  assert.equal(s.lightPeriods, 2);
  assert.equal(s.crew, 'safe');
  assert.equal(s.log.length, 6);
});
test('C C G: missed shelter spends nothing and logs no failed action', () => {
  const s = play('C C G');
  assert.equal(s.outcome, 'missed-shelter');
  assert.equal(s.battery, 68);
  assert.equal(s.log.length, 2);
  assert.equal(s.crew, 'unsafe');
});
test('C C S C C C: partial success, 14 kWh', () => {
  const s = play('C C S C C C');
  assert.equal(s.outcome, 'partial-success');
  assert.equal(s.battery, 14);
  assert.equal(s.crew, 'safe');
  assert.equal(s.lightPeriods, 0);
});
test('G G S G C C: power failure before turn 6', () => {
  const s = play('G G S G C C');
  assert.equal(s.outcome, 'power-failure');
  assert.equal(s.battery, 8);
  assert.equal(s.turn, 6);
  assert.equal(s.log.length, 5);
});
test('Retry resets May and all terminal outcomes block further actions', () => {
  for (const seq of ['C C G', 'C C S G G C', 'C C S C C C', 'G G S G C C']) {
    const ended = play(seq);
    const snapshot = structuredClone(ended);
    for (const action of Object.values(moves)) assert.strictEqual(chooseAction(ended, action), ended);
    assert.deepEqual(ended, snapshot);
    assert.deepEqual(retry(events), createGame(events));
  }
  const first = retry(events);
  first.log.push({ turn: 99 });
  assert.equal(retry(events).log.length, 0);
});
test('UTC timing: 14 h 57 min after fictional start, derived from timestamps', () => {
  assert.deepEqual(getTiming(events), { fictionalScenarioStart: '2024-05-10T13:10:00.000Z', elapsedMinutes: 897, alertTurn: 3 });
  const shifted = structuredClone(events);
  shifted.sep.eventTime = '2024-05-11T07:10:00Z';
  assert.equal(getTiming(shifted).alertTurn, 4);
});
test('Warning is present before the turn-3 choice', () => {
  const s = play('C C');
  assert.equal(s.turn, 3);
  assert.equal(s.outcome, null);
  assert.equal(s.log.length, 2);
  assert.match(getWarning(s), /Danger from the Sun! Choose Shelter now/);
  assert.doesNotMatch(getWarning(createGame(events)), /Danger from the Sun!/);
});
test('UI warning precedes controls and is rendered before enabling choices', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="warning"') < html.indexOf('data-action="conserve"'));
  assert.ok(app.indexOf("el('warning').textContent = getWarning(state)") < app.indexOf('button.disabled ='));
  assert.match(app, /state = retry\(events\);\s+takeCommand\(\)/);
});
test('Power priority, shelter shortfall, and exact cost boundary', () => {
  const initial = createGame(events);
  for (const action of Object.values(moves)) {
    const failed = chooseAction({ ...initial, turn: 3, battery: 11 }, action);
    assert.equal(failed.outcome, 'power-failure');
    assert.equal(failed.battery, 11);
    const short = chooseAction({ ...initial, turn: 3, battery: 17 }, action);
    assert.equal(short.outcome, 'shelter-power-shortfall');
    assert.equal(short.battery, 17);
    assert.strictEqual(chooseAction(short, action), short);
  }
  assert.equal(chooseAction({ ...initial, turn: 3, battery: 18 }, 'shelter').battery, 0);
});
test('Unaffordable actions spend nothing; earlier shelter does not protect turn 3', () => {
  const s = chooseAction({ ...createGame(events), battery: 12 }, 'greenhouse');
  assert.equal(s.battery, 12);
  assert.equal(s.turn, 1);
  assert.equal(s.log.length, 0);
  assert.equal(s.outcome, null);
  assert.match(s.feedback, /needs 18 kWh/);
  assert.equal(play('S C G').outcome, 'missed-shelter');
});
test('Every six-turn action sequence keeps battery nonnegative and input unchanged', () => {
  function visit(s, depth) {
    if (!depth || s.outcome) return;
    for (const action of Object.values(moves)) {
      const snapshot = structuredClone(s);
      const next = chooseAction(s, action);
      assert.deepEqual(s, snapshot);
      assert.ok(next.battery >= 0);
      if (!next.outcome) assert.ok(next.turn <= 6);
      visit(next, depth - 1);
    }
  }
  visit(createGame(events), 6);
});
