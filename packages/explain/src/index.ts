// biome-ignore-all lint/performance/noBarrelFile: this is the package's public entry point, so re-exporting is its purpose
export type { ConfigOptions, ExplainConfig } from "./config.js";
export { configure, disable, enable, resetConfig } from "./config.js";
export { ExplainError } from "./errors.js";
export type { RenderOptions, ReportData, ReportInput } from "./report.js";
export { TraceReport } from "./report.js";
export type { TracedResult, TraceOptions } from "./trace.js";
export { EXPLAIN_REPORT, getReport, trace, traceAsync, traceReport } from "./trace.js";
export type {
  Drop,
  Finding,
  FindingCode,
  OpKind,
  Severity,
  Step,
  StepError,
  StepFacts,
} from "./types.js";
