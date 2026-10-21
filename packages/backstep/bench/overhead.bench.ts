import { bench, describe } from "vitest";
import { configure, resetConfig, trace } from "../src/index.js";

const data = Array.from({ length: 100_000 }, (_, i) => ({ id: i, price: i % 97, stock: i % 3 }));

const pipeline = (items: typeof data) =>
  items
    .filter((item) => item.stock > 0)
    .map((item) => item.price)
    .reduce((a, b) => a + b, 0);

// Configuration happens in setup, so the measured loop only times the trace call itself.
describe("100k-element pipeline", () => {
  bench("native", () => {
    pipeline(data);
  });

  bench(
    "trace, disabled",
    () => {
      trace("bench", data, pipeline);
    },
    {
      setup() {
        resetConfig();
        configure({ enabled: false });
      },
    },
  );

  bench(
    "trace, enabled",
    () => {
      trace("bench", data, pipeline);
    },
    {
      setup() {
        resetConfig();
        configure({ enabled: true, onReport: null });
      },
    },
  );
});
