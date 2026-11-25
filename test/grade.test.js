const test = require('node:test');
const assert = require('node:assert/strict');

const { gradeAnswer } = require('../lib/grade');

test('gradeAnswer awards basePoints for correct on-time answers', () => {
  const openedAt = 1_000_000;
  const closesAt = openedAt + 30_000;
  const receivedAt = openedAt + 5_000;
  const result = gradeAnswer({
    correctAnswerId: 'B',
    selectedAnswerId: 'B',
    basePoints: 500,
    receivedAt,
    openedAt,
    closesAt,
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.pointsAwarded, 500);
  assert.equal(result.latencyMs, 5_000);
});

test('gradeAnswer scores zero when correct but after closesAt', () => {
  const openedAt = 2_000_000;
  const closesAt = openedAt + 30_000;
  const receivedAt = closesAt + 1;
  const result = gradeAnswer({
    correctAnswerId: 'A',
    selectedAnswerId: 'A',
    basePoints: 250,
    receivedAt,
    openedAt,
    closesAt,
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.pointsAwarded, 0);
  assert.equal(result.latencyMs, receivedAt - openedAt);
});

test('gradeAnswer scores zero for wrong answers inside the window', () => {
  const openedAt = 3_000_000;
  const closesAt = openedAt + 30_000;
  const result = gradeAnswer({
    correctAnswerId: 'C',
    selectedAnswerId: 'D',
    basePoints: 100,
    receivedAt: openedAt + 1_000,
    openedAt,
    closesAt,
  });
  assert.equal(result.isCorrect, false);
  assert.equal(result.pointsAwarded, 0);
});

test('gradeAnswer latencyMs ignores client-supplied fields and uses timestamps only', () => {
  const openedAt = 100;
  const closesAt = 13_000;
  const receivedAt = 2_820;
  const result = gradeAnswer({
    correctAnswerId: 'A',
    selectedAnswerId: 'A',
    basePoints: 10,
    receivedAt,
    openedAt,
    closesAt,
    clientLatencyMs: 999_999,
  });
  assert.equal(result.latencyMs, 2_720);
});