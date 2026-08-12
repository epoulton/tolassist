declare module "nlopt-js" {
  export interface NloptResult {
    readonly success: boolean;
    readonly x: readonly number[];
    readonly value: number;
  }

  export interface NloptOptimize {
    setLowerBounds(bounds: readonly number[]): void;
    setUpperBounds(bounds: readonly number[]): void;
    setMinObjective(
      callback: (x: readonly number[], gradient?: unknown) => number,
      tolerance: number,
    ): void;
    addInequalityConstraint(
      callback: (x: readonly number[], gradient?: unknown) => number,
      tolerance: number,
    ): void;
    setMaxtime(seconds: number): void;
    setMaxeval(evaluations: number): void;
    optimize(initial: readonly number[]): NloptResult;
  }

  export interface NloptModule {
    readonly ready: Promise<void>;
    readonly Algorithm: { readonly LN_COBYLA: unknown };
    readonly Optimize: new (
      algorithm: unknown,
      dimensions: number,
    ) => NloptOptimize;
    readonly GC: { flush(): void };
  }

  const nlopt: NloptModule;
  export default nlopt;
}
