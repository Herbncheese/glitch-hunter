import { GlitchDeal } from '../types/deals';

// Optional in-page keyword filter. The watch rules themselves live in src/rules/watchRules.ts.
export const DEFAULT_WATCHLIST_KEYWORDS = ['OLED', 'TV', 'Monitor', 'Laptop', 'MacBook', 'RTX', 'GPU', 'SSD'];

// The page starts empty until latest-scan.json loads. Nothing here is a sample deal.
export const INITIAL_GLITCH_DEALS: GlitchDeal[] = [];
