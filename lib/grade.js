const OPTION_ID = /^[A-D]$/;

function gradeAnswer({
  correctAnswerId,
  selectedAnswerId,
  basePoints,
  receivedAt,
  openedAt,
  closesAt,
}) {
  if (!OPTION_ID.test(correctAnswerId) || !OPTION_ID.test(selectedAnswerId)) {
    throw new TypeError('invalid answer id');
  }
  if (!Number.isFinite(receivedAt) || !Number.isFinite(openedAt) || !Number.isFinite(closesAt)) {
    throw new TypeError('timestamps required');
  }
  if (!Number.isInteger(basePoints) || basePoints < 1) {
    throw new TypeError('invalid basePoints');
  }
  const latencyMs = receivedAt - openedAt;
  const onTime = receivedAt <= closesAt;
  const isCorrect = selectedAnswerId === correctAnswerId;
  let pointsAwarded = 0;
  if (onTime) {
    pointsAwarded = isCorrect ? basePoints : -basePoints;
  }
  return { isCorrect, latencyMs, pointsAwarded, onTime };
}

module.exports = {
  gradeAnswer,
};