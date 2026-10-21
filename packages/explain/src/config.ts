import { ExplainError } from "./errors.js";
import { DEFAULT_REDACT_KEYS, type FormatOptions } from "./format.js";
import type { TraceReport } from "./report.js";

export interface ExplainConfig {
  /** When false, `trace` runs the callback directly and records nothing. */
  readonly enabled: boolean;
  /** Emit a report for every trace, not only when a divergence is found. */
  readonly always: boolean;
  /** Maximum number of sample elements kept per step. */
  readonly maxSamples: number;
  readonly maxDepth: number;
  readonly maxItems: number;
  readonly maxStringLength: number;
  readonly redactKeys: RegExp;
  /** Receives each report that needs attention. `null` disables output. */
  readonly onReport: ((report: TraceReport) => void) | null;
}

export type ConfigOptions = Partial<ExplainConfig>;

let current: ExplainConfig = defaults();

export function getConfig(): ExplainConfig {
  return current;
}

/**
 * Updates the global configuration. Options merge into the current values and are validated
 * before they take effect.
 */
export function configure(options: ConfigOptions = {}): ExplainConfig {
  const merged: ExplainConfig = { ...current, ...options };
  if (!(merged.redactKeys instanceof RegExp)) {
    throw new ExplainError("redactKeys must be a RegExp");
  }
  const next: ExplainConfig = { ...merged, redactKeys: withoutStatefulFlags(merged.redactKeys) };
  validate(next);
  current = next;
  return current;
}

export function enable(): ExplainConfig {
  return configure({ enabled: true });
}

export function disable(): ExplainConfig {
  return configure({ enabled: false });
}

/** Restores the defaults. Intended for tests. */
export function resetConfig(): void {
  current = defaults();
}

export function toFormatOptions(config: ExplainConfig): FormatOptions {
  return {
    maxDepth: config.maxDepth,
    maxItems: config.maxItems,
    maxStringLength: config.maxStringLength,
    redactKeys: config.redactKeys,
  };
}

function defaults(): ExplainConfig {
  return {
    enabled: resolveEnabled(),
    always: false,
    maxSamples: 5,
    maxDepth: 3,
    maxItems: 6,
    maxStringLength: 80,
    redactKeys: DEFAULT_REDACT_KEYS,
    onReport: defaultSink,
  };
}

/**
 * Tracing is on in development and test, and off in production. `EXPLAIN=1` or `EXPLAIN=0`
 * overrides this. With no `process` object (browsers), tracing starts off until configured.
 */
function resolveEnabled(): boolean {
  const env = looseProcess()?.env;
  if (!env) {
    return false;
  }
  const flag = env.EXPLAIN;
  if (flag !== undefined) {
    if (/^(1|true|yes|on)$/i.test(flag)) {
      return true;
    }
    if (/^(0|false|no|off)$/i.test(flag)) {
      return false;
    }
  }
  const nodeEnv = env.NODE_ENV;
  return nodeEnv === "development" || nodeEnv === "test";
}

function defaultSink(report: TraceReport): void {
  const text = report.toString({ color: colorSupported() });
  if (report.hasProblem) {
    console.warn(text);
  } else {
    console.log(text);
  }
}

function colorSupported(): boolean {
  const proc = looseProcess();
  return Boolean(proc?.stdout?.isTTY) && !proc?.env?.NO_COLOR;
}

interface LooseProcess {
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: { readonly isTTY?: boolean };
}

function looseProcess(): LooseProcess | undefined {
  return (globalThis as { process?: LooseProcess }).process;
}

/** `g` and `y` make `test()` stateful through `lastIndex`, which would make redaction flaky. */
function withoutStatefulFlags(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

function validate(config: ExplainConfig): void {
  assertInt("maxSamples", config.maxSamples, 0, 1000);
  assertInt("maxDepth", config.maxDepth, 0, 20);
  assertInt("maxItems", config.maxItems, 0, 1000);
  assertInt("maxStringLength", config.maxStringLength, 0, 10_000);
  if (config.onReport !== null && typeof config.onReport !== "function") {
    throw new ExplainError("onReport must be a function or null");
  }
}

function assertInt(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ExplainError(
      `${name} must be an integer between ${min} and ${max}, received ${value}`,
    );
  }
}
