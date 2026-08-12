import type { SolverDescriptor } from "./contracts";

export const nloptSolverDescriptor: SolverDescriptor = {
  id: "nlopt-cobyla",
  label: "NLopt COBYLA",
  capabilities: {
    nonlinearInequalities: true,
    nonlinearEqualities: true,
    variableBounds: true,
    derivativeFree: true,
    explicitMaximization: false,
    timeLimit: true,
    evaluationLimit: true,
    progress: "evaluations",
    cooperativeCancellation: false,
    forcedWorkerTermination: true,
    deterministic: true,
  },
  async load() {
    const { NloptOptimizationEngine } = await import("./nlopt/engine");
    return new NloptOptimizationEngine();
  },
};

export const productionSolverId = "nlopt-cobyla" as const;

export const productionSolverDescriptor = nloptSolverDescriptor;
