import { type Finding, type TraceReport, traceReport } from "value-lineage";

/**
 * A realistic bug in an array pipeline. `expected` names the step (0-based) where the report
 * should diverge and the finding that explains why. A case passes only if explain points at
 * that step, not merely at some step.
 */
export interface BugCase {
  readonly id: string;
  readonly title: string;
  readonly run: () => TraceReport;
  readonly expected: { readonly step: number; readonly code: Finding["code"] };
}

interface Order {
  id: string;
  status: string;
  tags: string[];
  items: Array<{ sku: string; price: number | undefined; qty: number; vip?: boolean }>;
}

const orders: Order[] = [
  {
    id: "o-1",
    status: "paid",
    tags: ["gift"],
    items: [
      { sku: "A", price: 10, qty: 2 },
      { sku: "B", price: 4, qty: 1 },
    ],
  },
  {
    id: "o-2",
    status: "paid",
    tags: [],
    items: [{ sku: "C", price: 25, qty: 1 }],
  },
  {
    id: "o-3",
    status: "refunded",
    tags: ["vip"],
    items: [{ sku: "D", price: undefined, qty: 3 }],
  },
];

function firstOrder(): Order {
  return orders[0] as Order;
}

function thirdOrder(): Order {
  return orders[2] as Order;
}

export const cases: BugCase[] = [
  {
    id: "inverted-predicate",
    title: "Inverted stock check drops every item",
    run: () =>
      traceReport("cart.total", firstOrder().items, (items) =>
        items
          .filter((item) => item.qty === 0)
          .map((item) => item.price ?? 0)
          .reduce((a, b) => a + b, 0),
      ).report,
    expected: { step: 0, code: "collapsed" },
  },
  {
    id: "stale-field",
    title: "Field renamed upstream; filter reads undefined",
    run: () =>
      traceReport("vip.orders", orders, (xs) =>
        xs.filter((order) => (order as Order & { isVip?: boolean }).isVip).map((order) => order.id),
      ).report,
    expected: { step: 0, code: "collapsed" },
  },
  {
    id: "string-concat",
    title: "Numeric strings from an API concatenated instead of summed",
    run: () =>
      traceReport("basket.sum", ["10", "4", "25"], (xs) => xs.reduce((a, b) => a + b, "")).report,
    expected: { step: 0, code: "numeric-string-concat" },
  },
  {
    id: "missing-price-nan",
    title: "Missing price turns the line total into NaN",
    run: () =>
      traceReport("order.lines", thirdOrder().items, (items) =>
        items.map((item) => (item.price ?? Number.NaN) * item.qty),
      ).report,
    expected: { step: 0, code: "non-finite" },
  },
  {
    id: "reduce-empty-no-init",
    title: "reduce without an initial value on an empty cart",
    run: () => safeReport("cart.max", [] as number[], (xs) => xs.reduce((a, b) => Math.max(a, b))),
    expected: { step: 0, code: "threw" },
  },
  {
    id: "boolean-comparator",
    title: "Sort comparator returns a boolean",
    run: () =>
      traceReport("prices.sorted", [30, 10, 20], (xs) =>
        xs.toSorted((a, b) => (a > b) as unknown as number),
      ).report,
    expected: { step: 0, code: "non-numeric-comparator" },
  },
  {
    id: "flatmap-empty-tags",
    title: "flatMap over tags that are empty for every order",
    run: () =>
      traceReport(
        "order.tags",
        orders.map((o) => ({ ...o, tags: [] as string[] })),
        (xs) => xs.flatMap((order) => order.tags),
      ).report,
    expected: { step: 0, code: "collapsed" },
  },
  {
    id: "slice-page-offset",
    title: "1-based page number used as a 0-based offset",
    run: () => {
      const page = 1;
      const size = 10;
      const ten = Array.from({ length: 10 }, (_, i) => i);
      return traceReport("page", ten, (xs) => xs.slice(page * size, page * size + size)).report;
    },
    expected: { step: 0, code: "collapsed" },
  },
  {
    id: "case-sensitive-tag",
    title: "Tag compared case-sensitively against lowercase data",
    run: () =>
      traceReport(
        "vip.items",
        orders.flatMap((o) => o.tags),
        (xs) => xs.filter((tag) => tag === "VIP"),
      ).report,
    // The flatMap runs outside the trace, so the traced pipeline starts at the filter.
    expected: { step: 0, code: "collapsed" },
  },
  {
    id: "map-missing-return",
    title: "Block-bodied map callback forgot to return",
    run: () =>
      traceReport("orders.total", orders, (xs) =>
        // biome-ignore lint/suspicious/useIterableCallbackReturn: the missing return is the bug
        xs.map((order) => {
          order.items.reduce((sum, item) => sum + item.qty, 0);
        }),
      ).report,
    expected: { step: 0, code: "non-finite" },
  },
  {
    id: "every-on-empty-cart",
    title: "every() over an empty cart is vacuously true, so checkout proceeds",
    run: () =>
      traceReport("checkout.ready", [] as Array<{ inStock: boolean }>, (items) =>
        items.every((item) => item.inStock),
      ).report,
    expected: { step: 0, code: "vacuous-every" },
  },
  {
    id: "default-sort-numbers",
    title: "sort() without a comparator orders prices as text",
    run: () => traceReport("prices.sorted", [10, 9, 100], (xs) => xs.toSorted()).report,
    expected: { step: 0, code: "default-numeric-sort" },
  },
  {
    id: "reduce-nan-from-missing-field",
    title: "Reduce adds an undefined field and the total becomes NaN",
    run: () =>
      traceReport("order.weight", (orders[1] as Order).items, (items) =>
        items.reduce((sum, item) => sum + (item as unknown as { weight: number }).weight, 0),
      ).report,
    expected: { step: 0, code: "non-finite" },
  },
];

function safeReport<I, R>(name: string, input: I, fn: (traced: I) => R): TraceReport {
  try {
    return traceReport(name, input, fn).report;
  } catch (error) {
    const attached = (error as Record<symbol, unknown>)[Symbol.for("explain.report")];
    if (attached && typeof attached === "object") {
      return attached as TraceReport;
    }
    throw error;
  }
}
