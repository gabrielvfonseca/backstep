import { formatShort } from "./format.js";
import { isPlainObject, type Session, StepRecorder } from "./recorder.js";
import type { OpKind } from "./types.js";

/**
 * Every traced array is a Proxy over a raw array plus `ids`, a parallel array holding each
 * element's root index. Operations carry `ids` forward, so an element's origin survives
 * filter, map, sort and slice. -1 marks an element whose origin is unknown (for example, one
 * written directly into the array).
 */
interface ArrayState {
  readonly session: Session;
  readonly raw: unknown[];
  ids: number[];
  readonly bound: Map<string, (...args: unknown[]) => unknown>;
}

type Callback = (...args: unknown[]) => unknown;
type Op = (state: ArrayState, args: unknown[], self: unknown[]) => unknown;

const stateOf = new WeakMap<object, ArrayState>();

/** Returns the raw array behind a traced proxy, or the value unchanged. */
export function unwrap(value: unknown): unknown {
  return isTraced(value) ? stateOf.get(value)?.raw : value;
}

/**
 * Unwraps a value returned from a traced pipeline. Proxies nested one level inside a returned
 * array or plain object are replaced with copies, so callers never receive a proxy.
 */
export function unwrapResult(value: unknown): unknown {
  const top = unwrap(value);
  if (Array.isArray(top)) {
    return top.some(isTraced) ? top.map((item) => unwrap(item)) : top;
  }
  if (isPlainObject(top)) {
    const keys = Object.keys(top);
    if (keys.some((key) => isTraced(top[key]))) {
      const copy: Record<string, unknown> = { ...top };
      for (const key of keys) {
        copy[key] = unwrap(copy[key]);
      }
      return copy;
    }
  }
  return top;
}

export function wrapArray(session: Session, raw: unknown[], ids: number[]): unknown[] {
  const state: ArrayState = { session, raw, ids, bound: new Map() };
  const proxy: unknown[] = new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const method = state.bound.get(prop) ?? bind(state, proxy, prop);
        if (method) {
          return method;
        }
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      const ok = Reflect.set(target, prop, unwrap(value));
      if (ok) {
        syncIds(state, arrayIndex(prop));
      }
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      const index = arrayIndex(prop);
      if (ok && index !== undefined) {
        state.ids[index] = -1;
      }
      return ok;
    },
  });
  stateOf.set(proxy, state);
  return proxy;
}

function isTraced(value: unknown): value is object {
  return typeof value === "object" && value !== null && stateOf.has(value);
}

function bind(
  state: ArrayState,
  self: unknown[],
  prop: string,
): ((...args: unknown[]) => unknown) | undefined {
  const op = OPS.get(prop);
  if (!op) {
    return undefined;
  }
  const method = (...args: unknown[]): unknown => op(state, args, self);
  state.bound.set(prop, method);
  return method;
}

/** Keeps `ids` the same length as the raw array after a write, marking written slots as unknown. */
function syncIds(state: ArrayState, index: number | undefined): void {
  state.ids.length = state.raw.length;
  if (index !== undefined) {
    state.ids[index] = -1;
  }
}

function arrayIndex(prop: string | symbol): number | undefined {
  return typeof prop === "string" && /^(?:0|[1-9]\d*)$/.test(prop) ? Number(prop) : undefined;
}

const OPS = new Map<string, Op>([
  ["filter", (st, args) => filterOp(st, args)],
  ["map", (st, args) => mapOp(st, args)],
  ["flatMap", (st, args) => flatMapOp(st, args)],
  ["reduce", (st, args) => reduceOp(st, args, false)],
  ["reduceRight", (st, args) => reduceOp(st, args, true)],
  ["find", (st, args) => searchOp(st, "find", args)],
  ["findIndex", (st, args) => searchOp(st, "findIndex", args)],
  ["findLast", (st, args) => searchOp(st, "findLast", args)],
  ["findLastIndex", (st, args) => searchOp(st, "findLastIndex", args)],
  ["some", (st, args) => searchOp(st, "some", args)],
  ["every", (st, args) => searchOp(st, "every", args)],
  ["sort", (st, args, self) => sortOp(st, args, self, false)],
  ["toSorted", (st, args, self) => sortOp(st, args, self, true)],
  ["slice", (st, args) => sliceOp(st, args)],
  ["concat", (st, args) => concatOp(st, args)],
  // Reordering keeps every element, so these are traced for lineage but not recorded as steps.
  [
    "reverse",
    (st, _args, self) => {
      st.raw.reverse();
      st.ids.reverse();
      return self;
    },
  ],
  ["toReversed", (st) => wrapArray(st.session, st.raw.slice().reverse(), st.ids.slice().reverse())],
]);

function withStep<T>(
  st: ArrayState,
  kind: OpKind,
  label: string,
  body: (rec: StepRecorder) => T,
): T {
  const rec = new StepRecorder(st.session, kind, label, st.raw);
  try {
    return body(rec);
  } catch (error) {
    rec.fail(error);
    throw error;
  }
}

function filterOp(st: ArrayState, args: unknown[]): unknown {
  const { raw, ids } = st;
  return withStep(st, "filter", callLabel("filter", args[0]), (rec) => {
    const cb = toCallback(args[0], "filter", st.session.redactKeys);
    const thisArg = args[1];
    const kept: unknown[] = [];
    const keptIds: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (!(i in raw)) {
        continue;
      }
      const value = raw[i];
      const verdict = cb.call(thisArg, value, i, raw);
      if (verdict) {
        kept.push(value);
        keptIds.push(originAt(ids, i));
      } else {
        rec.drop(
          originAt(ids, i),
          value,
          () => `${fnName(cb)} → ${formatShort(verdict, st.session.redactKeys)}`,
        );
      }
    }
    rec.commit(kept, kept.length);
    return wrapArray(st.session, kept, keptIds);
  });
}

function mapOp(st: ArrayState, args: unknown[]): unknown {
  const { raw, ids } = st;
  return withStep(st, "map", callLabel("map", args[0]), (rec) => {
    const cb = toCallback(args[0], "map", st.session.redactKeys);
    const thisArg = args[1];
    const out = new Array<unknown>(raw.length);
    for (let i = 0; i < raw.length; i++) {
      if (i in raw) {
        out[i] = unwrap(cb.call(thisArg, raw[i], i, raw));
      }
    }
    rec.facts.nonFiniteIntroduced = countIntroduced(raw, out);
    rec.facts.identicalOutputs = allIdentical(out) && !allIdentical(raw);
    rec.commit(out, out.length);
    return wrapArray(st.session, out, ids.slice());
  });
}

function flatMapOp(st: ArrayState, args: unknown[]): unknown {
  const { raw, ids } = st;
  return withStep(st, "flatMap", callLabel("flatMap", args[0]), (rec) => {
    const cb = toCallback(args[0], "flatMap", st.session.redactKeys);
    const thisArg = args[1];
    const out: unknown[] = [];
    const outIds: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (!(i in raw)) {
        continue;
      }
      const origin = originAt(ids, i);
      const produced = unwrap(cb.call(thisArg, raw[i], i, raw));
      if (Array.isArray(produced)) {
        if (produced.length === 0) {
          rec.drop(origin, raw[i], `${fnName(cb)} → []`);
        }
        for (const item of produced) {
          out.push(unwrap(item));
          outIds.push(origin);
        }
      } else {
        out.push(produced);
        outIds.push(origin);
      }
    }
    rec.commit(out, out.length);
    return wrapArray(st.session, out, outIds);
  });
}

function reduceOp(st: ArrayState, args: unknown[], right: boolean): unknown {
  const kind: OpKind = right ? "reduceRight" : "reduce";
  const hasInit = args.length >= 2;
  const init = args[1];
  const label = `${kind}(${fnName(args[0])}${hasInit ? `, ${formatShort(init, st.session.redactKeys)}` : ""})`;
  const { raw } = st;
  return withStep(st, kind, label, (rec) => {
    const cb = toCallback(args[0], kind, st.session.redactKeys);
    let calls = 0;
    const step = (acc: unknown, value: unknown, index: number, array: unknown[]): unknown => {
      calls++;
      return cb(acc, value, index, array);
    };
    // Delegating to the native method keeps hole-skipping and the empty-array TypeError exact.
    const result: unknown = right
      ? hasInit
        ? raw.reduceRight(step, init)
        : raw.reduceRight(step)
      : hasInit
        ? raw.reduce(step, init)
        : raw.reduce(step);

    const values = presentValues(raw);
    rec.facts.returnedInitial = calls === 0 && hasInit;
    rec.facts.numericStrings =
      values.length > 0 && values.every(isNumericString) && typeof result === "string";
    rec.facts.nonFiniteIntroduced = calls > 0 && isBad(result) && !values.some(isBad) ? 1 : 0;
    rec.commit([], 0, { value: result });
    return unwrap(result);
  });
}

type SearchKind = "find" | "findIndex" | "findLast" | "findLastIndex" | "some" | "every";

function searchOp(st: ArrayState, kind: SearchKind, args: unknown[]): unknown {
  const { raw, ids } = st;
  return withStep(st, kind, callLabel(kind, args[0]), (rec) => {
    const cb = toCallback(args[0], kind, st.session.redactKeys);
    const thisArg = args[1];
    const backward = kind === "findLast" || kind === "findLastIndex";
    // `find` visits holes as undefined; `some` and `every` skip them, as the native methods do.
    const skipHoles = kind === "some" || kind === "every";
    const n = raw.length;
    // Index of the element that ended the scan: the match, or for `every` the first failure.
    let stopAt = -1;
    for (let k = 0; k < n; k++) {
      const i = backward ? n - 1 - k : k;
      if (skipHoles && !(i in raw)) {
        continue;
      }
      const hit = Boolean(cb.call(thisArg, raw[i], i, raw));
      if (kind === "every" ? !hit : hit) {
        stopAt = i;
        break;
      }
    }

    const isFind = kind.startsWith("find");
    const found = kind === "every" ? stopAt < 0 : stopAt >= 0;
    let value: unknown;
    if (kind === "find" || kind === "findLast") {
      value = stopAt >= 0 ? raw[stopAt] : undefined;
    } else if (isFind) {
      value = stopAt;
    } else {
      value = found;
    }
    if (isFind) {
      rec.facts.noMatch = stopAt < 0;
      rec.facts.matchedOrigin = stopAt >= 0 ? originAt(ids, stopAt) : -1;
    }
    rec.commit([], found ? 1 : 0, { value });
    return unwrap(value);
  });
}

function sortOp(st: ArrayState, args: unknown[], self: unknown[], copy: boolean): unknown {
  const kind: OpKind = copy ? "toSorted" : "sort";
  const { raw, ids } = st;
  const label = args[0] === undefined ? `${kind}()` : callLabel(kind, args[0]);
  return withStep(st, kind, label, (rec) => {
    const comparator =
      args[0] === undefined ? undefined : toCallback(args[0], kind, st.session.redactKeys);
    const compare = (i: number, j: number): number => {
      const a = raw[i];
      const b = raw[j];
      if (comparator === undefined) {
        const sa = String(a);
        const sb = String(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      }
      const verdict = comparator(a, b);
      if (typeof verdict === "boolean") {
        rec.facts.nonNumericComparator = true;
      }
      // Matches the native sort: non-numeric results are coerced, and NaN counts as 0.
      const n = Number(verdict);
      return Number.isNaN(n) ? 0 : n;
    };

    // Positions hold indices into `raw`. Undefined values sort last, holes after them.
    const defined: number[] = [];
    const undefs: number[] = [];
    const holes: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (!(i in raw)) {
        holes.push(i);
      } else if (raw[i] === undefined) {
        undefs.push(i);
      } else {
        defined.push(i);
      }
    }
    rec.facts.defaultNumericSort =
      comparator === undefined &&
      defined.length > 0 &&
      defined.every((i) => typeof raw[i] === "number");
    defined.sort(compare);
    const order = [...defined, ...undefs, ...holes];
    const values = order.map((i) => raw[i]);
    const originIds = order.map((i) => originAt(ids, i));

    if (copy) {
      rec.commit(values, values.length);
      return wrapArray(st.session, values, originIds);
    }

    const holeFlags = order.map((i) => !(i in raw));
    for (let k = 0; k < order.length; k++) {
      if (holeFlags[k]) {
        delete raw[k];
      } else {
        raw[k] = values[k];
      }
    }
    st.ids = originIds;
    rec.commit(values, values.length);
    return self;
  });
}

function sliceOp(st: ArrayState, args: unknown[]): unknown {
  const { raw, ids } = st;
  const label = `slice(${args.map((arg) => formatShort(arg, st.session.redactKeys)).join(", ")})`;
  return withStep(st, "slice", label, (rec) => {
    const n = raw.length;
    const start = relativeIndex(args[0], n, 0);
    const end = relativeIndex(args[1], n, n);
    const out: unknown[] = [];
    const outIds: number[] = [];
    for (let i = 0; i < n; i++) {
      const origin = originAt(ids, i);
      if (i >= start && i < end) {
        out.push(raw[i]);
        outIds.push(origin);
      } else {
        rec.drop(origin, raw[i], "outside slice range");
      }
    }
    rec.commit(out, out.length);
    return wrapArray(st.session, out, outIds);
  });
}

/** Not recorded as a step: concatenation adds elements but never changes an existing one. */
function concatOp(st: ArrayState, args: unknown[]): unknown {
  const out = st.raw.slice();
  const outIds = st.ids.slice();
  for (const arg of args) {
    const argState = isTraced(arg) ? stateOf.get(arg) : undefined;
    const values: unknown[] = argState ? argState.raw : Array.isArray(arg) ? arg : [arg];
    for (let i = 0; i < values.length; i++) {
      out.push(values[i]);
      outIds.push(argState ? originAt(argState.ids, i) : -1);
    }
  }
  return wrapArray(st.session, out, outIds);
}

function originAt(ids: readonly number[], index: number): number {
  return ids[index] ?? -1;
}

function toCallback(value: unknown, op: string, redactKeys: RegExp): Callback {
  if (typeof value !== "function") {
    throw new TypeError(
      `${op}: callback must be a function, received ${formatShort(value, redactKeys)}`,
    );
  }
  return value as Callback;
}

function fnName(value: unknown): string {
  return typeof value === "function" && value.name ? value.name : "<anonymous>";
}

function callLabel(op: string, callback: unknown): string {
  return `${op}(${fnName(callback)})`;
}

function relativeIndex(value: unknown, length: number, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const n = Math.trunc(Number(value)) || 0;
  return n < 0 ? Math.max(length + n, 0) : Math.min(n, length);
}

function isBad(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "number" && Number.isNaN(value))
  );
}

/** Counts results that became bad although the input at the same position was usable. */
function countIntroduced(inputs: readonly unknown[], outputs: readonly unknown[]): number {
  let count = 0;
  for (let i = 0; i < outputs.length; i++) {
    if (i in outputs && isBad(outputs[i]) && !isBad(inputs[i])) {
      count++;
    }
  }
  return count;
}

/** True when two or more present values exist and all are identical (Object.is). */
function allIdentical(values: readonly unknown[]): boolean {
  let first: unknown;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    if (!(i in values)) {
      continue;
    }
    if (seen === 0) {
      first = values[i];
    } else if (!Object.is(values[i], first)) {
      return false;
    }
    seen++;
  }
  return seen > 1;
}

function presentValues(values: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i in values) {
      out.push(values[i]);
    }
  }
  return out;
}

function isNumericString(value: unknown): boolean {
  return typeof value === "string" && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(value);
}
