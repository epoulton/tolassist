# ADR 0002: Local development only for the initial implementation

- Status: Accepted
- Date: 2026-08-11

## Context

Distribution and hosting requirements are intentionally deferred while the application architecture and scientific engines are validated.

## Decision

Phase 0 provides local development, testing, preview, and production-build scripts only. It does not add deployment configuration, hosted services, or continuous-integration workflows.

## Consequences

- Development can proceed without prematurely constraining runtime asset delivery or response headers.
- Hosting compatibility must be assessed later as a separate architecture decision.
