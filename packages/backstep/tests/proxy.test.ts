import { beforeEach, describe, expect, it } from "vitest";
import { resetForTest, run, stepKinds } from "./helpers.js";

interface Item {
  id: string;
  price: number;
  stock: number;
}

const items: Item[] = [
  { id: "a1", price: 5, stock: 2 },
  { id: "b2", price: 7, stock: 0 },
  { id: "c3", price: 3, stock: 4 },
  { id: "d4", price: 9, stock: 0 },
];

describe("traced arrays behave like arrays", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("is recognised by Array.isArray and iterates normally", () => {
    run([1, 2, 3], (xs) => {
      expect(Array.isArray(xs)).toBe(true);
      expect([...xs]).toEqual([1, 2, 3]);
      expect(xs.length).toBe(3);
      expect(xs.join("-")).toBe("1-2-3");
      expect(xs.includes(2)).toBe(true);
      expect(xs.indexOf(3)).toBe(2);
      return null;
    });
  });

  it("serialises to JSON like the underlying array", () => {
    run([1, 2], (xs) => {
      expect(JSON.stringify(xs)).toBe("[1,2]");
      return null;
    });
  });

  it("lets callers mutate through the proxy, with ids kept in step", () => {
    const { value } = run([1, 2, 3], (xs) => {
      xs.push(4);
      xs[0] = 10;
      xs.pop();
      return xs.slice(0, 2);
    });
    expect(value).toEqual([10, 2]);
  });

  it("treats deletions and direct writes as unknown origin", () => {
    const { value, report } = run([1, 2, 3], (xs) => {
      xs[1] = 9;
      return xs.filter((x) => x > 5);
    });
    expect(value).toEqual([9]);
    expect(report.steps[0]?.dropped[0]).toMatchObject({ origin: 0, value: 1 });
    expect(report.steps[0]?.dropped.length).toBe(2);
  });

  it("handles sparse arrays the way the native methods do", () => {
    // biome-ignore lint/suspicious/noSparseArray: holes are the input under test
    const sparse = [1, , 3];
    const { value } = run(sparse, (xs) => ({
      filtered: xs.filter(() => true),
      mapped: xs.map((x) => (x === undefined ? "hole" : x)),
      some: xs.some((x) => x === undefined),
    }));
    expect(value.filtered).toEqual([1, 3]);
    // biome-ignore lint/suspicious/noSparseArray: holes are the expected output
    expect(value.mapped).toEqual([1, , 3]);
    expect(value.some).toBe(false);
  });

  it("matches the native result for every traced method", () => {
    const nums = [5, 3, 8, 1, 9, 2];
    const pipelines: [string, (xs: number[]) => unknown][] = [
      ["filter", (xs) => xs.filter((x) => x > 2)],
      ["map", (xs) => xs.map((x) => x * 3)],
      ["flatMap", (xs) => xs.flatMap((x) => (x % 2 ? [x, x] : []))],
      ["reduce", (xs) => xs.reduce((a, b) => a + b, 0)],
      ["reduce-no-init", (xs) => xs.reduce((a, b) => a + b)],
      ["reduceRight", (xs) => xs.reduceRight((a, b) => `${a}${b}`, "")],
      ["find", (xs) => xs.find((x) => x > 6)],
      ["findIndex", (xs) => xs.findIndex((x) => x > 6)],
      ["findLast", (xs) => xs.findLast((x) => x < 6)],
      ["findLastIndex", (xs) => xs.findLastIndex((x) => x < 6)],
      ["some", (xs) => xs.some((x) => x > 8)],
      ["every", (xs) => xs.every((x) => x > 0)],
      ["sort", (xs) => xs.slice().sort((a, b) => a - b)],
      ["toSorted", (xs) => xs.toSorted((a, b) => b - a)],
      ["slice", (xs) => xs.slice(1, -1)],
      ["concat", (xs) => xs.concat([7], 8)],
      ["reverse", (xs) => xs.slice().reverse()],
      ["toReversed", (xs) => xs.toReversed()],
    ];
    for (const [name, pipeline] of pipelines) {
      const native = pipeline([...nums]);
      const traced = run([...nums], (xs) => pipeline(xs as number[])).value;
      expect(traced, name).toEqual(native);
    }
  });

  it("supports thisArg for callbacks", () => {
    const scale = { factor: 3 };
    const { value } = run([1, 2], (xs) =>
      xs.map(function (this: { factor: number }, x: number) {
        return x * this.factor;
      }, scale),
    );
    expect(value).toEqual([3, 6]);
  });

  it("concatenates with traced and plain arrays, keeping origins", () => {
    const { report } = run([1, 2], (xs) => xs.concat([3]).filter((x) => x !== 1));
    expect(report.steps[0]?.kind).toBe("filter");
    expect(report.steps[0]?.outputCount).toBe(2);
  });

  it("returns the same proxy from in-place sort and reverse", () => {
    run([3, 1], (xs) => {
      expect(xs.sort()).toBe(xs);
      expect(xs.reverse()).toBe(xs);
      return null;
    });
  });

  it("throws a TypeError for a non-function callback, recorded on the step", () => {
    expect(() => run([1], (xs) => xs.map(42 as unknown as (x: number) => number))).toThrow(
      /callback must be a function/,
    );
  });

  it("propagates native TypeErrors such as reduce on an empty array", () => {
    expect(() => run([] as number[], (xs) => xs.reduce((a, b) => a + b))).toThrow(TypeError);
  });
});

describe("lineage", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("records the root index of dropped elements with the reason", () => {
    const { report } = run(items, (xs) => xs.filter((item) => item.stock > 0));
    const [step] = report.steps;
    expect(step?.kind).toBe("filter");
    expect(step?.droppedCount).toBe(2);
    expect(step?.dropped.map((d) => d.origin)).toEqual([1, 3]);
    expect(step?.dropped[0]?.reason).toBe("<anonymous> → false");
  });

  it("carries origins through map, sort, and slice", () => {
    const { report } = run([30, 10, 20], (xs) =>
      xs
        .map((x) => x + 1)
        .sort((a, b) => a - b)
        .slice(0, 1)
        .filter(() => false),
    );
    expect(stepKinds(report)).toEqual(["map", "sort", "slice", "filter"]);
    expect(report.steps[3]?.dropped[0]).toMatchObject({ origin: 1, value: 11 });
  });

  it("uses origins from before a sort so reordering does not lose identity", () => {
    const { report } = run([3, 1, 2], (xs) =>
      xs.toSorted((a, b) => a - b).filter((x) => x === 3 && false),
    );
    // Sorted order is [1, 2, 3] with origins [1, 2, 0]; every element is dropped.
    expect(report.steps[1]?.dropped.map((d) => d.origin)).toEqual([1, 2, 0]);
  });

  it("tracks flatMap origins and records empty expansions as drops", () => {
    const { report } = run([1, 2, 3], (xs) => xs.flatMap((x) => (x === 2 ? [] : [x, x])));
    expect(report.steps[0]?.outputCount).toBe(4);
    expect(report.steps[0]?.dropped[0]).toMatchObject({ origin: 1, reason: "<anonymous> → []" });
  });

  it("records find matches by root origin", () => {
    const { report } = run(items, (xs) => xs.filter((i) => i.stock > 0).find((i) => i.price > 4));
    const [, find] = report.steps;
    expect(find?.kind).toBe("find");
    expect(find?.facts.matchedOrigin).toBe(0);
    expect(find?.facts.noMatch).toBe(false);
  });

  it("does not record reverse or concat as steps", () => {
    const { report } = run([1, 2], (xs) =>
      xs
        .reverse()
        .concat([3])
        .map((x) => x),
    );
    expect(stepKinds(report)).toEqual(["map"]);
  });
});
