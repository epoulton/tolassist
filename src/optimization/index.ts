/** Solver-neutral optimization contracts and adapter registry boundary. */
export * from "./contracts";
export * from "./compiler";
export * from "./registry";

// Concrete engines are intentionally not re-exported from this boundary.
// Development/tests may import `./mock`; future adapters live in their own modules.
