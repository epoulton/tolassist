import { unit } from "mathjs";

import type { ScalarQuantity } from "./expression";

const numberFormatter = new Intl.NumberFormat("en", {
  maximumSignificantDigits: 8,
});

export function formatQuantity(quantity: ScalarQuantity): string {
  if (quantity.unit === null) return numberFormatter.format(quantity.value);
  return unit(quantity.value, quantity.unit).toBest().format({ precision: 8 });
}
