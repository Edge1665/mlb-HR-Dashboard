import * as pkg from '@fractal-solutions/xgboost-js';

const XGBoostCtor = pkg.XGBoost ?? pkg.default?.XGBoost ?? pkg.default;

console.log('Package keys:', Object.keys(pkg));
console.log('Ctor type:', typeof XGBoostCtor);

const model = new XGBoostCtor({
  learningRate: 0.1,
  maxDepth: 3,
  minChildWeight: 1,
  numRounds: 10,
});

const X = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [2, 1],
  [2, 2],
];

const y = [0, 0, 0, 1, 1, 1];

console.log('Fitting...');
await model.fit(X, y);
console.log('Fit complete.');

console.log('Model JSON keys:', Object.keys(model.toJSON?.() ?? {}));

const batchPreds = model.predictBatch(X);
console.log('predictBatch output:');
console.dir(batchPreds, { depth: null });

const singlePred = model.predictSingle([1, 1]);
console.log('predictSingle([1,1]) output:');
console.dir(singlePred, { depth: null });