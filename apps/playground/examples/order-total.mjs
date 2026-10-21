import { trace } from "@gabrielvfonseca/backstep";

// Every item is marked unavailable, so the total silently comes out as 0.
const order = {
  id: "ord_1042",
  items: [
    { name: "Keyboard", price: 79, sku: "KB-01", stock: 0 },
    { name: "Mouse", price: 39, sku: "MS-02", stock: 0 },
    { name: "Monitor", price: 299, sku: "MN-03", stock: 0 },
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
