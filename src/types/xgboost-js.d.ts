declare module '@fractal-solutions/xgboost-js' {
  export class XGBoost {
    constructor(params?: {
      learningRate?: number;
      maxDepth?: number;
      minChildWeight?: number;
      numRounds?: number;
    });

    fit(X: number[][], y: number[]): Promise<void>;
    predictSingle(row: number[]): number;
    predictBatch(rows: number[][]): number[];
    getFeatureImportance?(): Record<string, number>;
    toJSON(): {
      trees: unknown[];
      params: Record<string, unknown>;
    };
  }

  const _default: {
    XGBoost: typeof XGBoost;
  };

  export default _default;
}