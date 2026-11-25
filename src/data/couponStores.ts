/** Stores whose public coupon-code posts are shown. Override with COUPON_STORES="Best Buy,Walmart". */
export const DEFAULT_COUPON_STORES = [
  'Best Buy',
  'Walmart',
  'Target',
  'Amazon',
  "Kohl's",
  'Newegg',
  'B&H',
  'Micro Center',
  'Dell',
  'Lenovo',
  'HP',
  'Samsung',
  'Apple',
  'Nintendo',
  'Meta',
] as const;

export function couponStoresFromEnv(raw = process.env.COUPON_STORES): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_COUPON_STORES];
  const stores = raw.split(',').map((store) => store.trim()).filter(Boolean);
  return stores.length ? stores : [...DEFAULT_COUPON_STORES];
}
