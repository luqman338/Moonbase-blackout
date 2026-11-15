/** Outcome lessons must follow real game results and leave the state untouched. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, chooseAction, getMissionLesson, getDebrief } from './game.mjs';

const events = JSON.parse(await readFile(new URL('./data/events.json', import.meta.url)));
const moves = { C: 'conserve', G: 'greenhouse', S: 'shelter' };
const play = path => path.split('').reduce((state, move) => chooseAction(state, moves[move]), createGame(events));

test('Each ending teaches its actual cause and links it to space planning', () => {
  const cases = [
    [play('CCSGGC'), 'full-win', /kept the crew safe and lit the plants/],
    [play('CCSCCC'), 'partial-success', /plants needed more light/],
    [play('CCG'), 'missed-shelter', /missed shelter when danger came/],
    [play('GGSGCC'), 'power-failure', /too little power for air and heat/],
    [chooseAction({ ...createGame(events), turn: 3, battery: 17 }, 'shelter'), 'shelter-power-shortfall', /Too little power was left for Shelter/],
  ];
  for (const [state, outcome, cause] of cases) {
    assert.equal(state.outcome, outcome);
    const snapshot = structuredClone(state);
    const lesson = getMissionLesson(state);
    assert.match(lesson, cause);
    assert.match(lesson, /Real space crews/);
    assert.ok(getDebrief(state).text);
    assert.deepEqual(state, snapshot);
  }
  assert.equal(getMissionLesson(createGame(events)), '');
});
