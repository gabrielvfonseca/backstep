import { analyze, firstDivergence } from "./analyze.js";
import { type ExplainConfig, getConfig, toFormatOptions } from "./config.js";
import { ExplainError, summarizeError } from "./errors.js";
import { unwrapResult, wrapArray } from "./proxy.js";
import { now, Session, snapshot } from "./recorder.js";
import { type ReportData, type ReportInput, TraceReport } from "./report.js";
import type { StepError } from "./types.js";

/** Symbol under which a failed trace attaches its report to the thrown error. */
export const EXPLAIN_REPORT = Symbol.for("explain.report");

export interface TraceOptions<R = unknown> {
  /** Predicate the result must satisfy. A failing predicate is reported as an error. */
  expect?(result: R): boolean;
  /** Describes the expectation in the report, for example "total is positive". */
  expectMessage?: string;
  /** Emit the report even when nothing diverged. */
  always?: boolean;
}

export interface TracedResult<R> {
  readonly value: R;
  readonly report: TraceReport;
}

interface Outcome {
  readonly report: TraceReport;
  readonly value: unknown;
  readonly failed: boolean;
  readonly error: unknown;
}

/**
 * Runs `fn` with a traced view of `input` and reports how the result was produced when it looks
 * wrong. Returns the same value `fn` would return. When tracing is disabled, `fn(input)` runs
 * directly with no wrapping.
 */
export function trace<I, R>(
  name: string,
  input: I,
  fn: (traced: I) => R,
  options: TraceOptions<R> = {},
): R {
  const config = getConfig();
  if (!config.enabled) {
    return fn(input);
  }
  const outcome = execute(name, input, fn, options, config);
  emit(outcome.report, options.always ?? config.always, config.onReport);
  if (outcome.failed) {
    attachReport(outcome.error, outcome.report);
    throw outcome.error;
  }
  return outcome.value as R;
}

/**
 * Async variant of `trace`. The callback may await between traced operations, for example to
 * fetch a value before filtering. Each traced array operation still runs synchronously; only the
 * callback itself is awaited.
 */
export async function traceAsync<I, R>(
  name: string,
  input: I,
  fn: (traced: I) => R | PromiseLike<R>,
  options: TraceOptions<R> = {},
): Promise<R> {
  const config = getConfig();
  if (!config.enabled) {
    return await fn(input);
  }
  const outcome = await executeAsync(name, input, fn, options, config);
  emit(outcome.report, options.always ?? config.always, config.onReport);
  if (outcome.failed) {
    attachReport(outcome.error, outcome.report);
    throw outcome.error;
  }
  return outcome.value as R;
}

/**
 * Like `trace`, but always records and returns the report, regardless of configuration or
 * whether a divergence was found. Intended for tooling and tests. If `fn` throws, the report is
 * attached to the error under `EXPLAIN_REPORT`.
 */
export function traceReport<I, R>(
  name: string,
  input: I,
  fn: (traced: I) => R,
  options: TraceOptions<R> = {},
): TracedResult<R> {
  const outcome = execute(name, input, fn, options, getConfig());
  if (outcome.failed) {
    attachReport(outcome.error, outcome.report);
    throw outcome.error;
  }
  return { value: outcome.value as R, report: outcome.report };
}

/** Returns the report attached to an error thrown from a traced run, if any. */
export function getReport(error: unknown): TraceReport | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const report = (error as Record<symbol, unknown>)[EXPLAIN_REPORT];
  return report instanceof TraceReport ? report : undefined;
}

function execute<I>(
  name: string,
  input: I,
  fn: (traced: I) => unknown,
  options: TraceOptions<unknown>,
  config: ExplainConfig,
): Outcome {
  const session = new Session(name, config.maxSamples, config.redactKeys);
  const reportInput = describeInput(input, config.maxSamples);
  const traced = Array.isArray(input)
    ? wrapArray(session, input as unknown[], indexes(input.length))
    : input;

  let value: unknown;
  let error: unknown;
  let failed = false;
  try {
    value = fn(traced as I);
    if (isThenable(value)) {
      throw new ExplainError(
        `trace("${name}") received a promise. Use traceAsync for callbacks that await.`,
      );
    }
  } catch (caught) {
    failed = true;
    error = caught;
  }
  return finish(session, reportInput, { failed, error, value }, options, config);
}

async function executeAsync<I>(
  name: string,
  input: I,
  fn: (traced: I) => unknown,
  options: TraceOptions<unknown>,
  config: ExplainConfig,
): Promise<Outcome> {
  const session = new Session(name, config.maxSamples, config.redactKeys);
  const reportInput = describeInput(input, config.maxSamples);
  const traced = Array.isArray(input)
    ? wrapArray(session, input as unknown[], indexes(input.length))
    : input;

  let value: unknown;
  let error: unknown;
  let failed = false;
  try {
    value = await fn(traced as I);
  } catch (caught) {
    failed = true;
    error = caught;
  }
  return finish(session, reportInput, { failed, error, value }, options, config);
}

function finish(
  session: Session,
  input: ReportInput,
  raw: { readonly failed: boolean; readonly error: unknown; readonly value: unknown },
  options: TraceOptions<unknown>,
  config: ExplainConfig,
): Outcome {
  const result = raw.failed ? undefined : unwrapResult(raw.value);
  const report = buildReport(
    session,
    input,
    { failed: raw.failed, error: raw.error, result },
    options,
    config,
  );
  return { report, value: result, failed: raw.failed, error: raw.error };
}

function buildReport(
  session: Session,
  input: ReportInput,
  outcome: { readonly failed: boolean; readonly error: unknown; readonly result: unknown },
  options: TraceOptions<unknown>,
  config: ExplainConfig,
): TraceReport {
  const error: StepError | undefined = outcome.failed ? summarizeError(outcome.error) : undefined;
  const findings = analyze(session.steps, {
    redactKeys: session.redactKeys,
    hasResult: !outcome.failed,
    result: outcome.result,
    error,
    expect: options.expect,
    expectMessage: options.expectMessage,
  });
  const data: ReportData = {
    name: session.name,
    durationMs: now() - session.startedAt,
    input,
    steps: session.steps,
    findings,
    divergedAt: firstDivergence(findings),
    result: outcome.result,
    error,
  };
  return new TraceReport(data, toFormatOptions(config));
}

function describeInput(input: unknown, maxSamples: number): ReportInput {
  if (Array.isArray(input)) {
    return {
      count: input.length,
      sample: input.slice(0, maxSamples).map((item) => snapshot(item)),
      value: undefined,
    };
  }
  return { count: undefined, sample: [], value: snapshot(input) };
}

function emit(
  report: TraceReport,
  always: boolean,
  sink: ((report: TraceReport) => void) | null,
): void {
  if (!sink || (!always && !report.hasProblem)) {
    return;
  }
  try {
    sink(report);
  } catch (error) {
    // A faulty sink must never break the program being debugged.
    console.error("[explain] onReport threw:", error);
  }
}

function attachReport(error: unknown, report: TraceReport): void {
  if (typeof error !== "object" || error === null) {
    return;
  }
  try {
    Object.defineProperty(error, EXPLAIN_REPORT, {
      value: report,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Frozen or sealed errors cannot carry the report. The report is still emitted.
  }
}

function indexes(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
