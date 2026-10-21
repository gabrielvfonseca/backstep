import { describe, expect, it } from "vitest";
import { isPlainObject, Session, StepRecorder, snapshot } from "../src/recorder.js";

describe("StepRecorder", () => {
  it("ignores a second commit or fail", () => {
    const session = new Session("t", 2);
    const rec = new StepRecorder(session, "map", "map(x)", [1]);
    rec.commit([1], 1);
    rec.commit([2, 3], 2);
    rec.fail(new Error("late"));
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]?.outputCount).toBe(1);
  });

  it("ignores a fail after a commit and a commit after a fail", () => {
    const session = new Session("t", 2);
    const failed = new StepRecorder(session, "map", "a", [1]);
    failed.fail(new Error("x"));
    failed.commit([], 0);
    expect(session.steps[0]?.error?.message).toBe("x");
    expect(session.steps).toHaveLength(1);
  });

  it("samples at most maxSamples drops but counts them all", () => {
    const session = new Session("t", 1);
    const rec = new StepRecorder(session, "filter", "f", [1, 2, 3]);
    rec.drop(0, 1, "r1");
    rec.drop(1, 2, () => "r2");
    rec.commit([], 0);
    expect(session.steps[0]?.droppedCount).toBe(2);
    expect(session.steps[0]?.dropped).toHaveLength(1);
  });

  it("snapshot copies arrays and plain objects but not class instances", () => {
    const arr = [1];
    expect(snapshot(arr)).not.toBe(arr);
    class Thing {}
    const thing = new Thing();
    expect(snapshot(thing)).toBe(thing);
    expect(snapshot(5)).toBe(5);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(thing)).toBe(false);
  });
});
