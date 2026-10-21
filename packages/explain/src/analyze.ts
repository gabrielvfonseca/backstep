import { formatShort } from "./format.js";
import type { Drop, Finding, FindingCode, Severity, Step, StepError } from "./types.js";

export interface EndState {
  readonly hasResult: boolean;
  readonly result: unknown;
  readonly error: StepError | undefined;
  readonly expect?: ((result: unknown) => boolean) | undefined;
  readonly expectMessage?: string | undefined;
}

type Adder = (
  severity: Severity,
  step: number | undefined,
  code: FindingCode,
  message: string,
) => void;

/** Operations that can turn a non-empty input into an empty output. */
const COLLAPSING = new Set<string>(["filter", "flatMap", "slice"]);
const FIND_FAMILY = new Set<string>(["find", "findIndex", "findLast", "findLastIndex"]);
/** A filter that keeps fewer than this share of its input is flagged. */
const DROP_MAJORITY = 0.9;

/** Applies the divergence rules to recorded steps and the final outcome. Pure and side-effect free. */
export function analyze(steps: readonly Step[], end: EndState): Finding[] {
  const findings: Finding[] = [];
  const add: Adder = (severity, step, code, message) => {
    findings.push({ severity, step, code, message });
  };

  for (const step of steps) {
    inspect(step, add);
  }
  if (end.error && !steps.some((step) => step.error)) {
    add("error", undefined, "threw", `threw ${end.error.name}: ${end.error.message}`);
  }
  if (end.hasResult && end.expect && !passes(end.expect, end.result)) {
    add(
      "error",
      steps.at(-1)?.index,
      "expectation-failed",
      `${end.expectMessage ?? "expect() predicate"} failed; result was ${formatShort(end.result)}`,
    );
  }
  return findings;
}

/** Index of the first step with a warning or error, or undefined when nothing diverged. */
export function firstDivergence(findings: readonly Finding[]): number | undefined {
  let best: number | undefined;
  for (const finding of findings) {
    if (finding.severity === "info" || finding.step === undefined) {
      continue;
    }
    if (best === undefined || finding.step < best) {
      best = finding.step;
    }
  }
  return best;
}

function inspect(step: Step, add: Adder): void {
  const at = step.index;
  if (step.error) {
    add("error", at, "threw", `${step.label} threw ${step.error.name}: ${step.error.message}`);
    return;
  }

  const f = step.facts;
  const produced = step.result?.value;

  if (step.inputCount > 0 && step.outputCount === 0 && COLLAPSING.has(step.kind)) {
    const reason = commonReason(step.dropped);
    add(
      "error",
      at,
      "collapsed",
      `removed all ${step.inputCount} element(s)${reason ? ` (${reason})` : ""}`,
    );
  } else if (
    step.kind === "filter" &&
    step.inputCount >= 2 &&
    step.outputCount > 0 &&
    step.droppedCount / step.inputCount >= DROP_MAJORITY
  ) {
    add(
      "warning",
      at,
      "dropped-majority",
      `dropped ${step.droppedCount} of ${step.inputCount} element(s)`,
    );
  }

  if (f.nonFiniteIntroduced > 0) {
    const message =
      step.kind === "reduce" || step.kind === "reduceRight"
        ? `reduce produced ${formatShort(produced)} from finite inputs`
        : `${f.nonFiniteIntroduced} of ${step.inputCount} result(s) are undefined, null or NaN`;
    add("error", at, "non-finite", message);
  }
  if (f.identicalOutputs) {
    add(
      "warning",
      at,
      "identical-outputs",
      `returned the same value for all ${step.inputCount} elements`,
    );
  }
  if (f.returnedInitial) {
    add(
      "warning",
      at,
      "returned-initial",
      `had no elements to combine and returned its initial value ${formatShort(produced)}`,
    );
  }
  if (f.nonNumericComparator) {
    add(
      "warning",
      at,
      "non-numeric-comparator",
      "comparator returned a boolean; JavaScript coerces it to 1 or 0, so the order is unreliable. Return a number such as a - b",
    );
  }
  if (f.numericStrings) {
    add(
      "warning",
      at,
      "numeric-string-concat",
      `combined numeric-looking strings into the string ${formatShort(produced)}; convert with Number() before reducing`,
    );
  }
  if (step.kind === "every" && step.inputCount === 0 && produced === true) {
    add(
      "warning",
      at,
      "vacuous-every",
      "every() over no elements is true; an empty input passes every check",
    );
  }
  if (f.defaultNumericSort) {
    add(
      "warning",
      at,
      "default-numeric-sort",
      "sort() without a comparator compares numbers as text (10 sorts before 9); pass (a, b) => a - b",
    );
  }
  if (FIND_FAMILY.has(step.kind) && f.noMatch) {
    add("info", at, "no-match", `no element matched; the result is ${formatShort(produced)}`);
  }
}

function commonReason(drops: readonly Drop[]): string | undefined {
  const counts = new Map<string, number>();
  for (const drop of drops) {
    counts.set(drop.reason, (counts.get(drop.reason) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [reason, count] of counts) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

function passes(predicate: (result: unknown) => boolean, result: unknown): boolean {
  try {
    return Boolean(predicate(result));
  } catch {
    return false;
  }
}
