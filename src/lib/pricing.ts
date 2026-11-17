/** Discount the full order subtotal, rounded to the nearest paise. */
export function orderDiscount(subtotal: number) {
  return Math.round(subtotal * 5) / 100;
}

export function payableTotal(subtotal: number, shipping = 0) {
  return Math.round((subtotal + shipping - orderDiscount(subtotal)) * 100) / 100;
}
