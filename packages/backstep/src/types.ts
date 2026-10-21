/** Severity of a finding. `error` and `warning` count as problems and can diverge a trace. */
export type Severity = "error" | "warning" | "info";

/** Traced array operations that produce a recorded step. */
export type OpKind =
  | "filter"
  | "map"
  | "flatMap"
  | "reduce"
  | "reduceRight"
  | "find"
  | "findIndex"
  | "findLast"
  | "findLastIndex"
  | "some"
  | "every"
  | "sort"
  | "toSorted"
  | "slice";

export type FindingCode =
  | "collapsed"
  | "dropped-majority"
  | "non-finite"
  | "identical-outputs"
  | "returned-initial"
  | "non-numeric-comparator"
  | "numeric-string-concat"
  | "no-match"
  | "vacuous-every"
  | "default-numeric-sort"
  | "threw"
  | "expectation-failed";

/** An element that a step removed, with the reason the step gave for removing it. */
export interface Drop {
  /** Index of the element in the root input, or -1 when its origin is unknown. */
  readonly origin: number;
  readonly reason: string;
  readonly value: unknown;
}

/** Measurements gathered while a step ran. Analysis rules read these instead of re-scanning data. */
export interface StepFacts {
  /** sort() or toSorted() without a comparator was given only numbers. */
  defaultNumericSort: boolean;
  /** A map produced one identical value for several distinct inputs. */
  identicalOutputs: boolean;
  /** Root index of the element a find-style operation matched, or -1. */
  matchedOrigin: number;
  /** A find-style operation matched nothing. */
  noMatch: boolean;
  /** Results that became undefined, null or NaN although their input was a usable value. */
  nonFiniteIntroduced: number;
  /** A sort comparator returned a boolean. */
  nonNumericComparator: boolean;
  /** A reduce combined numeric-looking strings into a string. */
  numericStrings: boolean;
  /** A reduce received no elements and returned its initial value. */
  returnedInitial: boolean;
}

export interface StepError {
  readonly message: string;
  readonly name: string;
}

/** One recorded operation in a traced pipeline. */
export interface Step {
  /** At most `maxSamples` removed elements, in input order. */
  readonly dropped: readonly Drop[];
  /** Total number of removed elements, including those not sampled. */
  readonly droppedCount: number;
  readonly durationMs: number;
  readonly error: StepError | undefined;
  readonly facts: StepFacts;
  readonly index: number;
  readonly inputCount: number;
  readonly inputSample: readonly unknown[];
  readonly kind: OpKind;
  readonly label: string;
  readonly outputCount: number;
  readonly outputSample: readonly unknown[];
  /** Set for operations that return a single value (reduce, find, some, every). */
  readonly result: { readonly value: unknown } | undefined;
}

export interface Finding {
  readonly code: FindingCode;
  readonly message: string;
  readonly severity: Severity;
  /** Index of the step the finding belongs to. Undefined for findings about the whole trace. */
  readonly step: number | undefined;
}
