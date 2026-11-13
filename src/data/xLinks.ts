export interface XLink {
  label: string;
  uri: string;
}

/** Manual click-through accounts. The scanner never calls the paid X API. */
export const X_DEAL_ACCOUNTS: XLink[] = [
  { label: '@thedealsguy_', uri: 'https://x.com/thedealsguy_' },
  { label: '@PayDirtDeals', uri: 'https://x.com/PayDirtDeals' },
  { label: '@ClearanceCapt', uri: 'https://x.com/ClearanceCapt' },
  { label: '@dealzbro_', uri: 'https://x.com/dealzbro_' },
];

export const X_SEARCH_LINKS: XLink[] = [
  ['"price glitch" OR "price error" TV', '("price glitch" OR "price error" OR "pricing error") (tv OR oled OR qled)'],
  ['"price error" laptop / MacBook', '("price error" OR "price glitch" OR "price mistake") (laptop OR macbook OR chromebook)'],
  ['"price error" monitor / GPU', '("price error" OR "price glitch" OR "price mistake") (monitor OR gpu OR rtx OR "graphics card")'],
  ['glitch at Best Buy / Walmart / Amazon', 'glitch (bestbuy OR "best buy" OR walmart OR amazon) (tv OR laptop OR monitor) -filter:retweets'],
  ['"pricing mistake" tech', '("pricing mistake" OR mispriced) (tv OR laptop OR monitor OR ipad OR ps5 OR xbox)'],
].map(([label, q]) => ({ label, uri: `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live` }));
