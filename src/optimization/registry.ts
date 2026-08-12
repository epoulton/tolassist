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

export const scipySolverDescriptor: SolverDescriptor = {
  id: "scipy-cobyla",
  label: "SciPy COBYLA (benchmark only)",
  capabilities: {
    nonlinearInequalities: true,
    nonlinearEqualities: true,
    variableBounds: true,
    derivativeFree: true,
    explicitMaximization: false,
    timeLimit: false,
    evaluationLimit: true,
    progress: "evaluations",
    cooperativeCancellation: true,
    forcedWorkerTermination: true,
    deterministic: true,
  },
  async load() {
    const { ScipyOptimizationEngine } = await import("./scipy/engine");
    return new ScipyOptimizationEngine();
  },
};

export const productionSolverId = "nlopt-cobyla" as const;

export const productionSolverDescriptor = nloptSolverDescriptor;

export const comparisonSolverRegistry = [
  nloptSolverDescriptor,
  scipySolverDescriptor,
] as const;

export function findComparisonSolverDescriptor(
  id: string,
): SolverDescriptor | undefined {
  return comparisonSolverRegistry.find((descriptor) => descriptor.id === id);
}
