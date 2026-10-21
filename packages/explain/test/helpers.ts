import { configure, resetConfig, traceReport } from "../src/index.js";

/** Runs a traced pipeline with reporting always enabled, for assertions on the report. */
export function run<I, R>(input: I, fn: (traced: I) => R) {
  return traceReport("value", input, fn);
}

export function stepKinds(report: { steps: readonly { kind: string }[] }): string[] {
  return report.steps.map((step) => step.kind);
}

export function resetForTest(): void {
  resetConfig();
  configure({ enabled: true, onReport: null });
}
