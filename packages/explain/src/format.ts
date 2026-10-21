export interface FormatOptions {
  readonly maxDepth: number;
  readonly maxItems: number;
  readonly maxStringLength: number;
  /** Object keys matching this pattern are shown as "[redacted]". */
  readonly redactKeys: RegExp;
}

export const DEFAULT_REDACT_KEYS =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|private[-_]?key|credit[-_]?card|card[-_]?number|ssn/i;

const SHORT: FormatOptions = {
  maxDepth: 1,
  maxItems: 3,
  maxStringLength: 40,
  redactKeys: DEFAULT_REDACT_KEYS,
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Bounded, cycle-safe rendering of an arbitrary value. Never throws. */
export function formatValue(value: unknown, options: FormatOptions): string {
  return render(value, options, 0, new Set());
}

/** Compact rendering used inside step labels and findings. */
export function formatShort(value: unknown): string {
  return render(value, SHORT, 0, new Set());
}

function render(value: unknown, o: FormatOptions, depth: number, seen: Set<object>): string {
  switch (typeof value) {
    case "string":
      return quote(value, o.maxStringLength);
    case "number":
      return Object.is(value, -0) ? "-0" : String(value);
    case "bigint":
      return `${value}n`;
    case "boolean":
      return String(value);
    case "undefined":
      return "undefined";
    case "symbol":
      return String(value);
    case "function":
      return `[Function ${value.name || "anonymous"}]`;
    default:
      break;
  }
  if (value === null) {
    return "null";
  }

  const obj = value as object;
  if (seen.has(obj)) {
    return "[Circular]";
  }
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString();
  }
  if (obj instanceof Error) {
    return `${obj.name}: ${obj.message}`;
  }
  if (obj instanceof RegExp) {
    return String(obj);
  }
  if (obj instanceof Map) {
    return `Map(${obj.size})`;
  }
  if (obj instanceof Set) {
    return `Set(${obj.size})`;
  }

  const isArray = Array.isArray(obj);
  if (depth >= o.maxDepth) {
    return isArray ? `[…${obj.length}]` : "{…}";
  }

  seen.add(obj);
  try {
    if (isArray) {
      const items = obj as unknown[];
      const limit = Math.min(items.length, o.maxItems);
      const shown: string[] = [];
      for (let i = 0; i < limit; i++) {
        shown.push(child(() => items[i], o, depth + 1, seen));
      }
      if (items.length > limit) {
        shown.push(`…+${items.length - limit}`);
      }
      return `[${shown.join(", ")}]`;
    }

    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record);
    const parts: string[] = [];
    for (const key of keys.slice(0, o.maxItems)) {
      const rendered = o.redactKeys.test(key)
        ? '"[redacted]"'
        : child(() => record[key], o, depth + 1, seen);
      parts.push(`${formatKey(key)}: ${rendered}`);
    }
    if (keys.length > o.maxItems) {
      parts.push(`…+${keys.length - o.maxItems}`);
    }
    const ctor = constructorName(obj);
    const prefix = ctor && ctor !== "Object" ? `${ctor} ` : "";
    return `${prefix}{${parts.join(", ")}}`;
  } finally {
    seen.delete(obj);
  }
}

/** Renders a child value. A throwing getter is reported in place rather than breaking the report. */
function child(read: () => unknown, o: FormatOptions, depth: number, seen: Set<object>): string {
  try {
    return render(read(), o, depth, seen);
  } catch {
    return "[unreadable]";
  }
}

function quote(text: string, max: number): string {
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  return JSON.stringify(clipped);
}

function formatKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

function constructorName(obj: object): string | undefined {
  const proto: unknown = Object.getPrototypeOf(obj);
  if (proto === null) {
    return undefined;
  }
  const ctor = (proto as { constructor?: unknown }).constructor;
  return typeof ctor === "function" ? ctor.name : undefined;
}
