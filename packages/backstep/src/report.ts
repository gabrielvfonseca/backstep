import { type FormatOptions, formatShort, formatValue } from "./format.js";
import type { Finding, Severity, Step, StepError } from "./types.js";

export interface ReportInput {
  readonly count: number | undefined;
  readonly sample: readonly unknown[];
  readonly value: unknown;
}

export interface ReportData {
  readonly divergedAt: number | undefined;
  readonly durationMs: number;
  readonly error: StepError | undefined;
  readonly findings: readonly Finding[];
  readonly input: ReportInput;
  readonly name: string;
  readonly result: unknown;
  readonly steps: readonly Step[];
}

export interface RenderOptions {
  /** Emit ANSI colour codes. Defaults to plain text. */
  readonly color?: boolean;
}

interface Row {
  readonly label: string;
  readonly main: string;
  readonly marker: string;
  readonly subs: readonly string[];
}

const COLOR = { bold: 1, green: 32, red: 31, yellow: 33 } as const;
const MAX_SHOWN_DROPS = 3;

/** The outcome of one traced run. Immutable once built. */
export class TraceReport {
  readonly name: string;
  readonly durationMs: number;
  readonly input: ReportInput;
  readonly steps: readonly Step[];
  readonly findings: readonly Finding[];
  /** 0-based index into `steps` of the first step with a warning or error, or undefined. */
  readonly divergedAt: number | undefined;
  readonly result: unknown;
  readonly error: StepError | undefined;
  /** True when at least one warning or error was found. */
  readonly hasProblem: boolean;
  readonly #format: FormatOptions;

  constructor(data: ReportData, format: FormatOptions) {
    this.name = data.name;
    this.durationMs = data.durationMs;
    this.input = data.input;
    this.steps = data.steps;
    this.findings = data.findings;
    this.divergedAt = data.divergedAt;
    this.result = data.result;
    this.error = data.error;
    this.hasProblem = data.findings.some((finding) => finding.severity !== "info");
    this.#format = format;
  }

  /** Human-readable tree. Output size is bounded by the sampling limits. */
  toString(options: RenderOptions = {}): string {
    const color = options.color === true;
    const paint = (text: string, code: number): string =>
      color ? `\u001b[${code}m${text}\u001b[0m` : text;
    const fmt = this.#format;

    const head = this.error
      ? `${this.name} ${paint("✖", COLOR.red)} threw ${this.error.name}: ${this.error.message}`
      : `${this.name} = ${formatValue(this.result, fmt)}`;

    const problem = this.findings.find((finding) => finding.severity !== "info");
    let verdict = "";
    if (this.divergedAt !== undefined) {
      verdict = paint(`⚠ diverged at step ${this.divergedAt + 1}`, COLOR.yellow);
    } else if (problem && !this.error) {
      verdict = paint(`✖ ${problem.message}`, COLOR.red);
    } else if (!problem) {
      verdict = paint("✔ no divergence detected", COLOR.green);
    }

    const rows: Row[] = [
      { label: "input", main: describeInput(this.input, fmt), marker: "", subs: [] },
      ...this.steps.map((step) => this.#row(step, paint)),
    ];
    const width = Math.max(...rows.map((row) => row.label.length));

    const lines = [`${head}${verdict ? `   ${verdict}` : ""}`];
    rows.forEach((row, i) => {
      const last = i === rows.length - 1;
      const marker = row.marker ? `   ${row.marker}` : "";
      lines.push(` ${last ? "└" : "├"} ${row.label.padEnd(width)}  ${row.main}${marker}`);
      for (const sub of row.subs) {
        lines.push(` ${last ? " " : "│"}    ${sub}`);
      }
    });
    return lines.join("\n");
  }

  /** Plain-data form for logs and tooling. Values are display strings, so the output is always serializable. */
  toJSON() {
    const fmt = this.#format;
    const show = (value: unknown): string => formatValue(value, fmt);
    return {
      divergedAt: this.divergedAt ?? null,
      durationMs: this.durationMs,
      error: this.error ?? null,
      findings: this.findings.map((finding) => ({ ...finding })),
      input: {
        count: this.input.count ?? null,
        sample: this.input.sample.map(show),
        value: this.input.count === undefined ? show(this.input.value) : null,
      },
      name: this.name,
      result: this.error ? null : show(this.result),
      steps: this.steps.map((step) => ({
        dropped: step.dropped.map((drop) => ({
          origin: drop.origin,
          reason: drop.reason,
          value: show(drop.value),
        })),
        droppedCount: step.droppedCount,
        durationMs: step.durationMs,
        error: step.error ?? null,
        facts: { ...step.facts },
        index: step.index,
        inputCount: step.inputCount,
        inputSample: step.inputSample.map(show),
        kind: step.kind,
        label: step.label,
        outputCount: step.outputCount,
        outputSample: step.outputSample.map(show),
        result: step.result ? show(step.result.value) : null,
      })),
    };
  }

  #row(step: Step, paint: (text: string, code: number) => string): Row {
    const fmt = this.#format;
    const stepFindings = this.findings.filter((finding) => finding.step === step.index);

    let main: string;
    if (step.error) {
      main = `${paint("✖", COLOR.red)} threw ${step.error.name}`;
    } else if (step.result) {
      main = `${step.inputCount} → ${formatShort(step.result.value, fmt.redactKeys)}`;
    } else {
      main = `${step.inputCount} → ${step.outputCount}`;
    }

    const subs: string[] = [];
    if (!step.error && step.dropped.length > 0) {
      subs.push(`e.g. ${sampleDrops(step, fmt)}`);
    }
    for (const finding of stepFindings) {
      subs.push(`${icon(finding.severity, paint)} ${finding.message}`);
    }

    const worst = worstMarker(stepFindings, paint);

    return { label: step.label, main, marker: worst, subs };
  }
}

function describeInput(input: ReportInput, fmt: FormatOptions): string {
  if (input.count === undefined) {
    return formatValue(input.value, fmt);
  }
  return `${input.count} item${input.count === 1 ? "" : "s"}`;
}

function sampleDrops(step: Step, fmt: FormatOptions): string {
  const shown = step.dropped.slice(0, MAX_SHOWN_DROPS);
  const text = shown
    .map((drop) => `#${drop.origin < 0 ? "?" : drop.origin} ${formatValue(drop.value, fmt)}`)
    .join("  ");
  const more = step.droppedCount - shown.length;
  return more > 0 ? `${text}  …+${more}` : text;
}

function icon(severity: Severity, paint: (text: string, code: number) => string): string {
  if (severity === "error") {
    return paint("✖", COLOR.red);
  }
  if (severity === "warning") {
    return paint("⚠", COLOR.yellow);
  }
  return "·";
}

function worstMarker(
  findings: readonly Finding[],
  paint: (text: string, code: number) => string,
): string {
  if (findings.some((finding) => finding.severity === "error")) {
    return paint("✖", COLOR.red);
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return paint("⚠", COLOR.yellow);
  }
  return "";
}
