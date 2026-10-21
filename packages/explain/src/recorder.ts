import { summarizeError } from "./errors.js";
import type { Drop, OpKind, Step, StepFacts } from "./types.js";

/** Monotonic clock with a Date fallback, for environments without `performance`. */
export function now(): number {
  const perf = (globalThis as { performance?: { now: () => number } }).performance;
  return perf ? perf.now() : Date.now();
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Copies one level of an array or plain object so a sample keeps the state it had when recorded.
 * Deeper structure stays shared, which keeps sampling cheap.
 */
export function snapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (isPlainObject(value)) {
    return { ...value };
  }
  return value;
}

/** Per-trace state: the ordered steps recorded so far. */
export class Session {
  readonly steps: Step[] = [];
  readonly startedAt: number = now();
  readonly name: string;
  readonly maxSamples: number;
  readonly redactKeys: RegExp;

  constructor(name: string, maxSamples: number, redactKeys: RegExp) {
    this.name = name;
    this.maxSamples = maxSamples;
    this.redactKeys = redactKeys;
  }
}

/** Collects one step. Exactly one of `commit` or `fail` takes effect; later calls are ignored. */
export class StepRecorder {
  readonly facts: StepFacts = {
    defaultNumericSort: false,
    identicalOutputs: false,
    matchedOrigin: -1,
    noMatch: false,
    nonFiniteIntroduced: 0,
    nonNumericComparator: false,
    numericStrings: false,
    returnedInitial: false,
  };

  private readonly dropped: Drop[] = [];
  private droppedCount = 0;
  private readonly started = now();
  private readonly inputCount: number;
  private readonly inputSample: readonly unknown[];
  private done = false;
  private readonly session: Session;
  private readonly kind: OpKind;
  private readonly label: string;

  constructor(session: Session, kind: OpKind, label: string, input: readonly unknown[]) {
    this.session = session;
    this.kind = kind;
    this.label = label;
    this.inputCount = input.length;
    this.inputSample = input.slice(0, session.maxSamples).map(snapshot);
  }

  /** `reason` is computed only for sampled elements, so dropping many elements stays cheap. */
  drop(origin: number, value: unknown, reason: string | (() => string)): void {
    this.droppedCount += 1;
    if (this.dropped.length < this.session.maxSamples) {
      const text = typeof reason === "string" ? reason : reason();
      this.dropped.push({ origin, reason: text, value: snapshot(value) });
    }
  }

  commit(output: readonly unknown[], outputCount: number, result?: { value: unknown }): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: done is set by commit and fail, which the checker cannot follow from a field initialiser
    if (this.done) {
      return;
    }
    this.done = true;
    this.push({
      error: undefined,
      outputCount,
      outputSample: output.slice(0, this.session.maxSamples).map(snapshot),
      result,
    });
  }

  fail(error: unknown): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: done is set by commit and fail, which the checker cannot follow from a field initialiser
    if (this.done) {
      return;
    }
    this.done = true;
    this.push({
      error: summarizeError(error),
      outputCount: 0,
      outputSample: [],
      result: undefined,
    });
  }

  private push(outcome: {
    outputCount: number;
    outputSample: unknown[];
    result: { value: unknown } | undefined;
    error: Step["error"];
  }): void {
    this.session.steps.push({
      dropped: this.dropped,
      droppedCount: this.droppedCount,
      durationMs: now() - this.started,
      error: outcome.error,
      facts: this.facts,
      index: this.session.steps.length,
      inputCount: this.inputCount,
      inputSample: this.inputSample,
      kind: this.kind,
      label: this.label,
      outputCount: outcome.outputCount,
      outputSample: outcome.outputSample,
      result: outcome.result,
    });
  }
}
