import { trace } from "@gabrielvfonseca/value-lineage";

// Every item is marked unavailable, so the total silently comes out as 0.
const order = {
  id: "ord_1042",
  items: [
    { sku: "KB-01", name: "Keyboard", price: 79, stock: 0 },
    { sku: "MS-02", name: "Mouse", price: 39, stock: 0 },
    { sku: "MN-03", name: "Monitor", price: 299, stock: 0 },
  ],
};

const isAvailable = (item) => item.stock > 0;
const getPrice = (item) => item.price;

const total = trace("order.total", order.items, (items) =>
  items
    .filter(isAvailable)
    .map(getPrice)
    .reduce((a, b) => a + b, 0),
);

console.log("total:", total);
