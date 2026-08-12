import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MockOptimizationEngine } from "../optimization/mock";
import type { SolverDescriptor } from "../optimization";
import { App } from "./App";

const mockCapabilities: SolverDescriptor["capabilities"] = {
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
};

function mockDescriptor(load: SolverDescriptor["load"]): SolverDescriptor {
  return {
    id: "deterministic-mock",
    label: "Deterministic mock",
    capabilities: mockCapabilities,
    load,
  };
}

function enterFiniteVariable() {
  const stage1 = screen
    .getByRole("heading", { name: "Define the tolerance space" })
    .closest("section")!;
  const fields = within(stage1)
    .getAllByRole("article")[0]!
    .querySelectorAll("input");
  fireEvent.change(fields[0]!, { target: { value: "a" } });
  fireEvent.change(fields[1]!, { target: { value: "0" } });
  fireEvent.change(fields[2]!, { target: { value: "5" } });
  fireEvent.change(fields[3]!, { target: { value: "10" } });
  fireEvent.change(fields[4]!, { target: { value: "m" } });
  fireEvent.blur(fields[4]!);
  return fields;
}

describe("App", () => {
  it("presents all five workflow stages and two initial variable rows", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Confidence in tolerance design",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
    expect(
      screen.getAllByRole("button", { name: /delete variable/i }),
    ).toHaveLength(2);
  });

  it("validates on blur and toggles a valid row from three points to tolerance", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rows = screen.getAllByRole("article");
    const firstRow = rows[0]!;
    const fields = within(firstRow).getAllByRole("textbox");

    fireEvent.change(fields[0]!, { target: { value: "offset" } });
    fireEvent.change(fields[1]!, { target: { value: "0" } });
    fireEvent.change(fields[2]!, { target: { value: "3" } });
    fireEvent.change(fields[3]!, { target: { value: "10" } });
    fireEvent.change(fields[4]!, { target: { value: "mm" } });

    expect(
      within(firstRow).getByRole("button", { name: "Nom ± Tol" }),
    ).toBeDisabled();

    fireEvent.blur(fields[4]!);

    const validatedRow = screen.getAllByRole("article")[0]!;
    expect(
      within(validatedRow).getByText(/ready · 0 \/ 3 \/ 10 mm/i),
    ).toBeVisible();

    await user.click(
      within(validatedRow).getByRole("button", { name: "Nom ± Tol" }),
    );

    const toggledFields = within(
      screen.getAllByRole("article")[0]!,
    ).getAllByRole("textbox");
    expect(toggledFields[1]).toHaveValue("5");
    expect(toggledFields[2]).toHaveValue("5");
  });

  it("adds rows and permits deleting every row", async () => {
    const user = userEvent.setup();
    render(<App />);
    const stage1 = screen
      .getByRole("heading", { name: "Define the tolerance space" })
      .closest("section")!;

    await user.click(screen.getByRole("button", { name: /add variable/i }));
    expect(within(stage1).getAllByRole("article")).toHaveLength(3);

    for (const button of screen.getAllByRole("button", {
      name: /delete variable/i,
    })) {
      await user.click(button);
    }

    expect(within(stage1).queryAllByRole("article")).toHaveLength(0);
    expect(within(stage1).getByText("No variable rows yet.")).toBeVisible();
  });

  it("validates and calculates Stages 1–3 as one blur-triggered cycle", async () => {
    const user = userEvent.setup();
    render(<App />);
    const stage1 = screen
      .getByRole("heading", { name: "Define the tolerance space" })
      .closest("section")!;
    const stage2 = screen
      .getByRole("heading", { name: "Build the calculation chain" })
      .closest("section")!;
    const stage3 = screen
      .getByRole("heading", { name: "Define what must hold true" })
      .closest("section")!;
    const baseFields = within(stage1)
      .getAllByRole("article")[0]!
      .querySelectorAll("input");

    fireEvent.change(baseFields[0]!, { target: { value: "a" } });
    fireEvent.change(baseFields[1]!, { target: { value: "1" } });
    fireEvent.change(baseFields[2]!, { target: { value: "2" } });
    fireEvent.change(baseFields[3]!, { target: { value: "3" } });
    fireEvent.change(baseFields[4]!, { target: { value: "mm" } });
    fireEvent.blur(baseFields[4]!);

    const expressionFields = within(stage2).getAllByRole("textbox");
    fireEvent.change(expressionFields[0]!, { target: { value: "doubled" } });
    fireEvent.change(expressionFields[1]!, { target: { value: "2*a" } });
    fireEvent.blur(expressionFields[1]!);

    await user.click(within(stage2).getByRole("button", { name: /results/i }));
    expect(within(stage2).getByText("2 mm")).toBeVisible();
    expect(within(stage2).getByText("4 mm")).toBeVisible();
    expect(within(stage2).getByText("6 mm")).toBeVisible();

    await user.click(
      within(stage3).getByRole("button", { name: /add constraint/i }),
    );
    const constraint = within(stage3).getByRole("textbox");
    fireEvent.change(constraint, { target: { value: "doubled <= 5 mm" } });
    fireEvent.blur(constraint);

    expect(within(stage3).getByText("Nominal passes")).toBeVisible();
    expect(
      screen.getByText(
        /all populated inputs are valid and calculated results are current/i,
      ),
    ).toBeVisible();

    await user.click(
      within(stage3).getByRole("button", { name: /add constraint/i }),
    );
    const constraints = within(stage3).getAllByRole("textbox");
    fireEvent.change(constraints[1]!, {
      target: { value: "not a comparison" },
    });
    fireEvent.blur(constraints[1]!);

    expect(within(stage2).queryByText("4 mm")).not.toBeInTheDocument();
    expect(within(stage3).getAllByText("Not evaluated")).toHaveLength(2);

    await user.click(
      within(stage3).getByRole("button", { name: "Delete Constraint 2" }),
    );
    expect(within(stage3).getByText("Nominal passes")).toBeVisible();

    fireEvent.change(baseFields[0]!, { target: { value: "bad name" } });
    fireEvent.blur(baseFields[0]!);

    expect(baseFields[0]).toHaveValue("bad name");
    expect(within(stage2).queryByText("4 mm")).not.toBeInTheDocument();
    expect(within(stage3).getByText("Not evaluated")).toBeVisible();
    expect(screen.getByText(/some inputs need attention/i)).toBeVisible();
  });

  it("runs the selected engine and preserves an immutable result after input edits", async () => {
    const user = userEvent.setup();
    render(
      <App
        solverDescriptor={mockDescriptor(() =>
          Promise.resolve(new MockOptimizationEngine()),
        )}
      />,
    );
    const fields = enterFiniteVariable();
    const stage4 = screen
      .getByRole("heading", { name: "Configure the optimization problem" })
      .closest("section")!;
    const stage5 = screen
      .getByRole("heading", { name: "Review the result" })
      .closest("section")!;

    await user.selectOptions(
      within(stage4).getByLabelText("by updating"),
      within(stage4).getByRole("option", { name: "a (m)" }),
    );
    await user.click(within(stage4).getByRole("button", { name: "Optimize" }));

    expect(
      await within(stage4).findByText(/optimization succeeded/i),
    ).toBeVisible();
    expect(
      within(stage5).getByRole("heading", { name: "Review the result" }),
    ).toHaveFocus();
    expect(within(stage5).getByText("± 5 m")).toBeVisible();
    expect(within(stage5).getByText("Optimized")).toBeVisible();
    expect(
      within(stage5).getByText(/maximize the minimum tolerance/i),
    ).toBeVisible();

    fireEvent.change(fields[0]!, { target: { value: "renamed" } });
    fireEvent.blur(fields[0]!);

    expect(within(stage5).getAllByText("a")).toHaveLength(2);
    expect(within(stage5).queryByText("renamed")).not.toBeInTheDocument();
  });

  it("keeps the previous snapshot when a later optimization fails", async () => {
    const user = userEvent.setup();
    let loadCount = 0;
    const descriptor = mockDescriptor(() => {
      loadCount += 1;
      return Promise.resolve(
        loadCount === 1
          ? new MockOptimizationEngine()
          : new MockOptimizationEngine((problem) => {
              const candidate = [...problem.description.initialDecisionVector];
              candidate[candidate.length - 1] = candidate[1]! + 1;
              return candidate;
            }),
      );
    });
    render(<App solverDescriptor={descriptor} />);
    enterFiniteVariable();
    const stage4 = screen
      .getByRole("heading", { name: "Configure the optimization problem" })
      .closest("section")!;
    const stage5 = screen
      .getByRole("heading", { name: "Review the result" })
      .closest("section")!;

    await user.selectOptions(
      within(stage4).getByLabelText("by updating"),
      within(stage4).getByRole("option", { name: "a (m)" }),
    );
    await user.click(within(stage4).getByRole("button", { name: "Optimize" }));
    expect(await within(stage5).findByText("± 5 m")).toBeVisible();

    await user.click(within(stage4).getByRole("button", { name: "Run again" }));

    expect(
      await within(stage4).findByText(
        /did not find a solution that keeps every constraint green/i,
      ),
    ).toBeVisible();
    expect(within(stage4).getByRole("alert")).toHaveFocus();
    expect(within(stage5).getByText("± 5 m")).toBeVisible();
    expect(
      within(stage5).getByRole("button", { name: "Export result" }),
    ).toBeVisible();
  });

  it("cancels an active optimization without creating a result", async () => {
    const user = userEvent.setup();
    const engineId = "cancellable-mock";
    const engineVersion = "1.0.0";
    const descriptor = mockDescriptor(() =>
      Promise.resolve({
        id: engineId,
        version: engineVersion,
        initialize() {
          return Promise.resolve({
            id: engineId,
            label: "Cancellable mock",
            adapterVersion: engineVersion,
            runtimeVersion: null,
            initializationMs: 0,
          });
        },
        solve(_problem, _options, signal, onProgress) {
          onProgress?.({ phase: "solving", evaluations: 1, elapsedMs: 1 });
          return new Promise((resolve) => {
            signal?.addEventListener(
              "abort",
              () =>
                resolve({
                  solverId: engineId,
                  solverVersion: engineVersion,
                  outcome: "cancelled",
                  evaluations: 1,
                  elapsedMs: 1,
                  terminationCode: "aborted",
                  message: "Optimization was cancelled.",
                  diagnostics: [],
                }),
              { once: true },
            );
          });
        },
        dispose() {
          return Promise.resolve();
        },
      }),
    );
    render(<App solverDescriptor={descriptor} />);
    enterFiniteVariable();
    const stage4 = screen
      .getByRole("heading", { name: "Configure the optimization problem" })
      .closest("section")!;
    const stage5 = screen
      .getByRole("heading", { name: "Review the result" })
      .closest("section")!;
    await user.selectOptions(
      within(stage4).getByLabelText("by updating"),
      within(stage4).getByRole("option", { name: "a (m)" }),
    );
    await user.click(within(stage4).getByRole("button", { name: "Optimize" }));
    await user.click(
      await within(stage4).findByRole("button", { name: "Cancel" }),
    );

    expect(
      await within(stage4).findByText(/^Optimization was cancelled\./),
    ).toBeVisible();
    expect(within(stage4).getByRole("status")).toHaveFocus();
    expect(
      within(stage5).getByText("No successful optimization result yet."),
    ).toBeVisible();
  });
});
