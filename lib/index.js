const { ConflictPredictor } = require('./conflict-predictor.js');
const { BehavioralFingerprinter } = require('./behavioral-fingerprint.js');
const { AlternativeGenerator } = require('./alternative-generator.js');
const { MultiDimensionalScorer } = require('./multi-dimensional-scorer.js');
const { RollbackSimulator } = require('./rollback-simulator.js');

async function runAnalysis(packageName) {
  const conflictPredictor = new ConflictPredictor();
  const behavioralFingerprinter = new BehavioralFingerprinter();
  const alternativeGenerator = new AlternativeGenerator();
  const multiDimensionalScorer = new MultiDimensionalScorer();
  const rollbackSimulator = new RollbackSimulator();

  let conflictResult = { conflictRisk: 0 };
  let fingerprintResult = { complexity: 0 };
  let alternativeResult = { suggested: '' };
  let scorerResult = { maintainerRisk: 50, finalRiskScore: 50 };
  let rollbackResult = { removalComplexityScore: 50 };

  try {
    conflictResult = await conflictPredictor.analyze(packageName);
  } catch (e) {
    if (e.message === 'Package not found') throw e;
  }

  try {
    fingerprintResult = await behavioralFingerprinter.analyze(packageName);
  } catch (e) {
    if (e.message === 'Package not found') throw e;
  }

  try {
    alternativeResult = await alternativeGenerator.analyze(packageName);
  } catch (_) {}

  try {
    scorerResult = await multiDimensionalScorer.analyze(packageName);
  } catch (e) {
    if (e.message === 'Package not found') throw e;
  }

  try {
    rollbackResult = await rollbackSimulator.analyze(packageName);
  } catch (_) {}

  const behavioralComplexity = fingerprintResult.complexity != null ? fingerprintResult.complexity : 0;
  const conflictRisk = conflictResult.conflictRisk != null ? conflictResult.conflictRisk : 0;
  const maintainerRisk = scorerResult.maintainerRisk != null ? scorerResult.maintainerRisk : 50;
  const rollbackDifficulty = rollbackResult.removalComplexityScore != null ? rollbackResult.removalComplexityScore : 50;

  const finalRiskScore = Math.min(100, Math.round(
    conflictRisk * 0.2 +
    Math.min(100, behavioralComplexity) * 0.2 +
    maintainerRisk * 0.3 +
    rollbackDifficulty * 0.3
  ));

  return {
    packageName,
    conflictRisk,
    behavioralComplexity,
    maintainerRisk,
    rollbackDifficulty,
    finalRiskScore,
    suggestedAlternative: alternativeResult.suggested || alternativeResult.code || '',
  };
}

module.exports = {
  runAnalysis,
  ConflictPredictor,
  BehavioralFingerprinter,
  AlternativeGenerator,
  MultiDimensionalScorer,
  RollbackSimulator,
};
