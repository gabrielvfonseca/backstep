import { type Finding, type TraceReport, traceReport } from "backstep";

/**
 * A realistic bug in an array pipeline. `expected` names the step (0-based) where the report
 * should diverge and the finding that explains why. A case passes only if backstep points at
 * that step, not merely at some step.
 */
export interface BugCase {
  readonly expected: { readonly step: number; readonly code: Finding["code"] };
  readonly id: string;
  readonly run: () => TraceReport;
  readonly title: string;
}

interface Order {
  id: string;
  items: Array<{ sku: string; price: number | undefined; qty: number; vip?: boolean }>;
  status: string;
  tags: string[];
}

const orders: Order[] = [
  {
    id: "o-1",
    items: [
      { price: 10, qty: 2, sku: "A" },
      { price: 4, qty: 1, sku: "B" },
    ],
    status: "paid",
    tags: ["gift"],
  },
  {
    id: "o-2",
    items: [{ price: 25, qty: 1, sku: "C" }],
    status: "paid",
    tags: [],
  },
  {
    id: "o-3",
    items: [{ price: undefined, qty: 3, sku: "D" }],
    status: "refunded",
    tags: ["vip"],
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
    expected: { code: "collapsed", step: 0 },
    id: "inverted-predicate",
    run: () =>
      traceReport("cart.total", firstOrder().items, (items) =>
        items
          .filter((item) => item.qty === 0)
          .map((item) => item.price ?? 0)
          .reduce((a, b) => a + b, 0),
      ).report,
    title: "Inverted stock check drops every item",
  },
  {
    expected: { code: "collapsed", step: 0 },
    id: "stale-field",
    run: () =>
      traceReport("vip.orders", orders, (xs) =>
        xs.filter((order) => (order as Order & { isVip?: boolean }).isVip).map((order) => order.id),
      ).report,
    title: "Field renamed upstream; filter reads undefined",
  },
  {
    expected: { code: "numeric-string-concat", step: 0 },
    id: "string-concat",
    run: () =>
      traceReport("basket.sum", ["10", "4", "25"], (xs) => xs.reduce((a, b) => a + b, "")).report,
    title: "Numeric strings from an API concatenated instead of summed",
  },
  {
    expected: { code: "non-finite", step: 0 },
    id: "missing-price-nan",
    run: () =>
      traceReport("order.lines", thirdOrder().items, (items) =>
        items.map((item) => (item.price ?? Number.NaN) * item.qty),
      ).report,
    title: "Missing price turns the line total into NaN",
  },
  {
    expected: { code: "threw", step: 0 },
    id: "reduce-empty-no-init",
    run: () => safeReport("cart.max", [] as number[], (xs) => xs.reduce((a, b) => Math.max(a, b))),
    title: "reduce without an initial value on an empty cart",
  },
  {
    expected: { code: "non-numeric-comparator", step: 0 },
    id: "boolean-comparator",
    run: () =>
      traceReport("prices.sorted", [30, 10, 20], (xs) =>
        xs.toSorted((a, b) => (a > b) as unknown as number),
      ).report,
    title: "Sort comparator returns a boolean",
  },
  {
    expected: { code: "collapsed", step: 0 },
    id: "flatmap-empty-tags",
    run: () =>
      traceReport(
        "order.tags",
        orders.map((o) => ({ ...o, tags: [] as string[] })),
        (xs) => xs.flatMap((order) => order.tags),
      ).report,
    title: "flatMap over tags that are empty for every order",
  },
  {
    expected: { code: "collapsed", step: 0 },
    id: "slice-page-offset",
    run: () => {
      const page = 1;
      const size = 10;
      const ten = Array.from({ length: 10 }, (_, i) => i);
      return traceReport("page", ten, (xs) => xs.slice(page * size, page * size + size)).report;
    },
    title: "1-based page number used as a 0-based offset",
  },
  {
    // The flatMap runs outside the trace, so the traced pipeline starts at the filter.
    expected: { code: "collapsed", step: 0 },
    id: "case-sensitive-tag",
    run: () =>
      traceReport(
        "vip.items",
        orders.flatMap((o) => o.tags),
        (xs) => xs.filter((tag) => tag === "VIP"),
      ).report,
    title: "Tag compared case-sensitively against lowercase data",
  },
  {
    expected: { code: "non-finite", step: 0 },
    id: "map-missing-return",
    run: () =>
      traceReport("orders.total", orders, (xs) =>
        // biome-ignore lint/suspicious/useIterableCallbackReturn: the missing return is the bug
        xs.map((order) => {
          order.items.reduce((sum, item) => sum + item.qty, 0);
        }),
      ).report,
    title: "Block-bodied map callback forgot to return",
  },
  {
    expected: { code: "vacuous-every", step: 0 },
    id: "every-on-empty-cart",
    run: () =>
      traceReport("checkout.ready", [] as Array<{ inStock: boolean }>, (items) =>
        items.every((item) => item.inStock),
      ).report,
    title: "every() over an empty cart is vacuously true, so checkout proceeds",
  },
  {
    expected: { code: "default-numeric-sort", step: 0 },
    id: "default-sort-numbers",
    run: () => traceReport("prices.sorted", [10, 9, 100], (xs) => xs.toSorted()).report,
    title: "sort() without a comparator orders prices as text",
  },
  {
    expected: { code: "non-finite", step: 0 },
    id: "reduce-nan-from-missing-field",
    run: () =>
      traceReport("order.weight", (orders[1] as Order).items, (items) =>
        items.reduce((sum, item) => sum + (item as unknown as { weight: number }).weight, 0),
      ).report,
    title: "Reduce adds an undefined field and the total becomes NaN",
  },
];

function safeReport<I, R>(name: string, input: I, fn: (traced: I) => R): TraceReport {
  try {
    return traceReport(name, input, fn).report;
  } catch (error) {
    const attached = (error as Record<symbol, unknown>)[Symbol.for("backstep.report")];
    if (attached && typeof attached === "object") {
      return attached as TraceReport;
    }
    throw error;
  }
}
