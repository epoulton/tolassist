import type { SolverDescriptor } from "./contracts";
import { nloptSolverDescriptor } from "./production";

export {
  nloptSolverDescriptor,
  productionSolverDescriptor,
  productionSolverId,
} from "./production";

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

export const comparisonSolverRegistry = [
  nloptSolverDescriptor,
  scipySolverDescriptor,
] as const;

export function findComparisonSolverDescriptor(
  id: string,
): SolverDescriptor | undefined {
  return comparisonSolverRegistry.find((descriptor) => descriptor.id === id);
}
