import { trace } from "backstep";

// A boolean comparator looks reasonable but does not sort reliably.
const prices = [30, 10, 20];

const sorted = trace("prices.sorted", prices, (xs) => xs.toSorted((a, b) => a > b));

console.log("sorted:", sorted);
