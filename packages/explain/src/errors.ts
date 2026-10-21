import type { StepError } from "./types.js";

/** Thrown for misuse of explain itself, such as an invalid configuration or an async callback. */
export class ExplainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplainError";
  }
}

export function summarizeError(error: unknown): StepError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: safeString(error) };
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unprintable value]";
  }
}
