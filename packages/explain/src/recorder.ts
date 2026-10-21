import { summarizeError } from "./errors.js";
import type { Drop, OpKind, Step, StepFacts } from "./types.js";

/** Monotonic clock with a Date fallback, for environments without `performance`. */
export function now(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
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

  constructor(
    readonly name: string,
    readonly maxSamples: number,
    readonly redactKeys: RegExp,
  ) {}
}

/** Collects one step. Exactly one of `commit` or `fail` takes effect; later calls are ignored. */
export class StepRecorder {
  readonly facts: StepFacts = {
    nonFiniteIntroduced: 0,
    identicalOutputs: false,
    nonNumericComparator: false,
    returnedInitial: false,
    numericStrings: false,
    noMatch: false,
    matchedOrigin: -1,
    defaultNumericSort: false,
  };

  private readonly dropped: Drop[] = [];
  private droppedCount = 0;
  private readonly started = now();
  private readonly inputCount: number;
  private readonly inputSample: readonly unknown[];
  private done = false;

  constructor(
    private readonly session: Session,
    private readonly kind: OpKind,
    private readonly label: string,
    input: readonly unknown[],
  ) {
    this.inputCount = input.length;
    this.inputSample = input.slice(0, session.maxSamples).map(snapshot);
  }

  /** `reason` is computed only for sampled elements, so dropping many elements stays cheap. */
  drop(origin: number, value: unknown, reason: string | (() => string)): void {
    this.droppedCount++;
    if (this.dropped.length < this.session.maxSamples) {
      const text = typeof reason === "string" ? reason : reason();
      this.dropped.push({ origin, value: snapshot(value), reason: text });
    }
  }

  commit(output: readonly unknown[], outputCount: number, result?: { value: unknown }): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.push({
      outputCount,
      outputSample: output.slice(0, this.session.maxSamples).map(snapshot),
      result,
      error: undefined,
    });
  }

  fail(error: unknown): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.push({
      outputCount: 0,
      outputSample: [],
      result: undefined,
      error: summarizeError(error),
    });
  }

  private push(outcome: {
    outputCount: number;
    outputSample: unknown[];
    result: { value: unknown } | undefined;
    error: Step["error"];
  }): void {
    this.session.steps.push({
      index: this.session.steps.length,
      kind: this.kind,
      label: this.label,
      inputCount: this.inputCount,
      outputCount: outcome.outputCount,
      inputSample: this.inputSample,
      outputSample: outcome.outputSample,
      dropped: this.dropped,
      droppedCount: this.droppedCount,
      result: outcome.result,
      error: outcome.error,
      facts: this.facts,
      durationMs: now() - this.started,
    });
  }
}
