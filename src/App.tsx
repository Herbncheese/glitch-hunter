import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, SlidersHorizontal, RefreshCw, ArrowUpDown, AlertCircle, Rss, CheckCircle2, Bot, Volume2, VolumeX, Bell, Tag, Clock, ScrollText, ExternalLink } from 'lucide-react';
import { DealCategory, GlitchDeal, SourceStatus, XGlitchPost, XSearchLink } from './types/deals';
import type { RejectionRow, StoredAlert } from './types/alerts';
import { INITIAL_GLITCH_DEALS, DEFAULT_WATCHLIST_KEYWORDS } from './data/initialDeals';
import { actionsSecretsUrl, actionsWorkflowUrl, loadDashboard } from './data/liveData';
import { DealCard } from './components/DealCard';
import { LiveGlitchRadarSidebar } from './components/LiveGlitchRadarSidebar';
import { formatPT } from './scanner/time';

type SortOption = 'substance-desc' | 'recent' | 'discount-desc' | 'price-asc' | 'savings-desc';
type TabId = DealCategory | 'saved';

const POLL_SECONDS = 60;

const WATCH_TABS: TabId[] = ['tech-clearance', 'cyber-laptop', 'mac-mini', 'kids', 'local-ai', 'christmas-2026'];

const CATEGORY_TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Matches' },
  { id: 'price-errors', label: 'Possible Price Errors' },
  { id: 'tech-clearance', label: 'Tech & Clearance' },
  { id: 'cyber-laptop', label: 'Cyber Laptop' },
  { id: 'mac-mini', label: 'Mac mini' },
  { id: 'kids', label: 'Kids Watch' },
  { id: 'local-ai', label: 'Local AI Machine' },
  { id: 'christmas-2026', label: 'Christmas 2026' },
  { id: 'saved', label: 'Saved' },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function playBotAlertSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };
    playTone(587.33, 0, 0.14);
    playTone(880.0, 0.15, 0.24);
  } catch {
    // autoplay restrictions
  }
}

export default function App() {
  const [deals, setDeals] = useState<GlitchDeal[]>(INITIAL_GLITCH_DEALS);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [minDiscount, setMinDiscount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('substance-desc');
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const [autoHuntActive, setAutoHuntActive] = useState<boolean>(true);
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState<number>(POLL_SECONDS);
  const [soundAlertEnabled, setSoundAlertEnabled] = useState<boolean>(false);
  const [watchlistInput, setWatchlistInput] = useState<string>(DEFAULT_WATCHLIST_KEYWORDS.join(', '));
  const [watchlistOnlyFilter, setWatchlistOnlyFilter] = useState<boolean>(false);
  const [alertRows, setAlertRows] = useState<StoredAlert[]>([]);
  const [rejections, setRejections] = useState<RejectionRow[]>([]);
  const [rejectionCount, setRejectionCount] = useState<number>(0);
  const [rejectionReasons, setRejectionReasons] = useState<{ reason: string; count: number }[]>([]);
  const [dataOrigin, setDataOrigin] = useState<'live' | 'bundled' | ''>('');
  const [discordConfigured, setDiscordConfigured] = useState<boolean>(false);
  const [discordDelivery, setDiscordDelivery] = useState<string>('none');
  const [baselineComplete, setBaselineComplete] = useState<boolean | undefined>(undefined);
  const [newMatchCount, setNewMatchCount] = useState<number>(0);
  const [scannedAtPt, setScannedAtPt] = useState<string>('');

  // Ids seen in earlier polls. A deal is "new" only if it appears after the first successful scan.
  const seenDealIdsRef = useRef<Set<string>>(new Set());
  const isFirstScanRef = useRef<boolean>(true);

  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [scanSummary, setScanSummary] = useState<string>('Fetching live deal feeds...');
  const [sourceStatus, setSourceStatus] = useState<SourceStatus[]>([]);
  const [xPosts, setXPosts] = useState<XGlitchPost[]>([]);
  const [xSearchLinks, setXSearchLinks] = useState<XSearchLink[]>([]);
  const [xAccounts, setXAccounts] = useState<XSearchLink[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);

  const parsedWatchlistKeywords = useMemo(
    () => watchlistInput.split(',').map((kw) => kw.trim()).filter((kw) => kw.length > 0),
    [watchlistInput]
  );

  const dealsWithWatchlist = useMemo(() => {
    const regexes = parsedWatchlistKeywords.map((kw) => ({ kw, re: new RegExp(`\\b${escapeRe(kw)}\\b`, 'i') }));
    return deals.map((deal) => ({
      ...deal,
      matchedWatchlistKeywords: regexes.filter(({ re }) => re.test(deal.title)).map(({ kw }) => kw),
    }));
  }, [deals, parsedWatchlistKeywords]);

  const handleToggleSave = (id: string) =>
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const handleToggleSource = (source: string) =>
    setActiveSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]));

  const refreshLiveData = useCallback(
    async (isAutoPoll: boolean = false) => {
      setIsScanning(true);
      setScanError(null);
      try {
        const data = await loadDashboard();
        const scan = data.scan;
        if (Array.isArray(scan.deals)) {
          const newlyDiscovered: GlitchDeal[] = [];
          const processed = scan.deals.map((deal) => {
            const isNew = !isFirstScanRef.current && !seenDealIdsRef.current.has(deal.id);
            seenDealIdsRef.current.add(deal.id);
            if (isNew) newlyDiscovered.push(deal);
            return { ...deal, isNewBotFind: isNew };
          });
          isFirstScanRef.current = false;
          setDeals(processed);
          if (isAutoPoll && newlyDiscovered.length > 0 && soundAlertEnabled) playBotAlertSound();
        } else {
          setDeals([]);
        }
        setSourceStatus(Array.isArray(scan.sourceStatus) ? scan.sourceStatus : []);
        setXPosts(Array.isArray(scan.xPosts) ? scan.xPosts : []);
        setXSearchLinks(Array.isArray(scan.xSearchLinks) ? scan.xSearchLinks : []);
        setXAccounts(Array.isArray(scan.xAccounts) ? scan.xAccounts : []);
        setScanSummary(scan.scanSummary || 'No scan summary yet.');
        const pt = scan.scannedAtPT || (scan.scannedAt ? formatPT(Date.parse(scan.scannedAt)) : '');
        setScannedAtPt(pt);
        setLastScannedAt(pt);
        setDiscordConfigured(Boolean(scan.discordConfigured));
        setDiscordDelivery(scan.discordDelivery || 'none');
        setBaselineComplete(scan.baselineComplete);
        setNewMatchCount(scan.newMatchCount || 0);
        setRejectionReasons(Array.isArray(scan.rejectionReasonCounts) ? scan.rejectionReasonCounts : []);
        setAlertRows(data.history);
        setRejections(data.rejections.rejections || []);
        setRejectionCount(data.rejections.count || 0);
        setDataOrigin(data.origin);
        setSecondsUntilNextPoll(POLL_SECONDS);
      } catch (err: any) {
        setScanError(err?.message || 'Unable to load the latest scan.');
      } finally {
        setIsScanning(false);
      }
    },
    [soundAlertEnabled]
  );

  // Keep a ref to the latest scan function so the timer effect does not restart on every keystroke
  const scanRef = useRef(refreshLiveData);
  useEffect(() => {
    scanRef.current = refreshLiveData;
  }, [refreshLiveData]);

  useEffect(() => {
    scanRef.current(false);
  }, []);

  useEffect(() => {
    if (!autoHuntActive) return;
    const interval = setInterval(() => {
      setSecondsUntilNextPoll((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [autoHuntActive]);

  useEffect(() => {
    if (autoHuntActive && secondsUntilNextPoll === 0 && !isScanning) {
      setSecondsUntilNextPoll(POLL_SECONDS);
      scanRef.current(true);
    }
  }, [autoHuntActive, secondsUntilNextPoll, isScanning]);

  const matchesTab = (deal: GlitchDeal, tab: TabId) => {
    if (tab === 'all') return true;
    if (tab === 'saved') return savedIds.includes(deal.id);
    if (tab === 'price-errors') return deal.isPossiblePriceError;
    if (WATCH_TABS.includes(tab)) return (deal.matchedRules || []).some((r) => r.ruleId === tab);
    return deal.category === tab;
  };

  const filteredDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dealsWithWatchlist
      .filter((deal) => {
        if (watchlistOnlyFilter && !(deal.matchedWatchlistKeywords || []).length) return false;
        if (!matchesTab(deal, activeTab)) return false;
        if (minDiscount > 0 && deal.discountPercent < minDiscount) return false;
        if (activeSources.length > 0 && !activeSources.includes(deal.sourceChannel)) return false;
        if (q) {
          const hay = `${deal.title} ${deal.retailer} ${deal.specsSummary} ${deal.skuOrAsin} ${deal.sourceChannel}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'substance-desc') {
          const diff = (b.substanceScore || 0) - (a.substanceScore || 0);
          return diff !== 0 ? diff : b.detectedTimestamp - a.detectedTimestamp;
        }
        if (sortBy === 'discount-desc') return b.discountPercent - a.discountPercent;
        if (sortBy === 'price-asc') return a.glitchPrice - b.glitchPrice;
        if (sortBy === 'savings-desc') {
          const savA = a.discountPercent > 0 ? a.originalPrice - a.glitchPrice : 0;
          const savB = b.discountPercent > 0 ? b.originalPrice - b.glitchPrice : 0;
          return savB - savA;
        }
        return b.detectedTimestamp - a.detectedTimestamp;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsWithWatchlist, watchlistOnlyFilter, activeTab, minDiscount, activeSources, searchQuery, sortBy, savedIds]);

  // All KPI numbers are computed from the currently fetched deals - nothing hardcoded.
  const metrics = useMemo(() => {
    const discounted = filteredDeals.filter((d) => d.discountPercent > 0);
    return {
      activeCount: filteredDeals.length,
      maxDiscount: discounted.length ? Math.max(...discounted.map((d) => d.discountPercent)) : 0,
      priceErrorCount: dealsWithWatchlist.filter((d) => d.isPossiblePriceError).length,
      watchlistMatchCount: filteredDeals.filter((d) => (d.matchedWatchlistKeywords || []).length > 0).length,
      newBotFindCount: dealsWithWatchlist.filter((d) => d.isNewBotFind).length,
    };
  }, [filteredDeals, dealsWithWatchlist]);

  const workingSources = sourceStatus.filter((s) => s.state === 'ok' || s.state === 'cached').length;

  const handleQuickJump = (deal: GlitchDeal) => {
    setSearchQuery(deal.title.slice(0, 28));
    setMinDiscount(0);
    setActiveTab('all');
  };

  const resetFilters = () => {
    setActiveTab('all');
    setSearchQuery('');
    setActiveSources([]);
    setMinDiscount(0);
    setWatchlistOnlyFilter(false);
  };

  const navTabs: TabId[] = ['all', 'price-errors', 'tech-clearance', 'cyber-laptop', 'kids', 'christmas-2026'];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/90 px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              resetFilters();
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            GlitchHunter
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            {navTabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${activeTab === id ? 'text-emerald-400' : ''}`}
              >
                {CATEGORY_TABS.find((t) => t.id === id)?.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setAutoHuntActive((prev) => !prev)}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                autoHuntActive ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span className="font-mono tabular-nums">{autoHuntActive ? `Auto-refresh in ${secondsUntilNextPoll}s` : 'Auto-refresh paused'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-5 border-b border-slate-800/80">
            <div className="max-w-2xl">
              <div className="text-xs text-emerald-400 font-medium mb-1.5">
                {sourceStatus.length > 0
                  ? `${workingSources} of ${sourceStatus.length} sources responding · Slickdeals · Reddit · Woot · Meh · DealNews · 9to5Toys · X`
                  : 'Connecting to deal sources...'}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight text-balance">
                Live Price Errors & Watch-Rule Matches
              </h1>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">{scanSummary}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                refreshLiveData(false);
              }}
              className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto"
            >
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search OLED, RTX, MacBook, TV..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !soundAlertEnabled;
                  setSoundAlertEnabled(next);
                  if (next) playBotAlertSound();
                }}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  soundAlertEnabled ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {soundAlertEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                <span>{soundAlertEnabled ? 'Chime On' : 'Chime Off'}</span>
              </button>
              <button
                type="submit"
                disabled={isScanning}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-5 border-b border-slate-800/80">
            <div className="lg:col-span-7 bg-[#0B0F17] border border-slate-800/90 rounded-lg p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="watchlist-keywords-input" className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Watchlist keywords (comma-separated, whole words):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWatchlistOnlyFilter((prev) => !prev)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    watchlistOnlyFilter ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200 bg-slate-800/70'
                  }`}
                >
                  {watchlistOnlyFilter ? `Showing watchlist matches (${metrics.watchlistMatchCount})` : `Watchlist only (${metrics.watchlistMatchCount})`}
                </button>
              </div>
              <input
                id="watchlist-keywords-input"
                type="text"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value)}
                placeholder="OLED, RTX, MacBook, Monitor, TV"
                className="w-full px-3 py-1.5 rounded bg-[#111827] border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-xs text-slate-100 font-mono"
              />
            </div>
            <div className="lg:col-span-5 bg-[#0B0F17] border border-slate-800/90 rounded-lg p-3.5">
              <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-2">
                <Bell className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Discord alerts run in GitHub Actions:{' '}
                  {discordConfigured ? <span className="text-emerald-400">secret is set</span> : <span className="text-amber-300">secret not set on the last scan</span>}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Add repository secret <span className="font-mono text-slate-200">DISCORD_WEBHOOK_URL</span>. The scanner posts new watch-rule matches every 5 minutes. The webhook is never stored in the repo, the scan JSON, or this page. Last delivery: <span className="font-mono text-slate-200">{discordDelivery}</span>.
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <a href={actionsWorkflowUrl()} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                  Run a scan in Actions
                </a>
                <a href={actionsSecretsUrl()} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                  Settings → Secrets → Actions
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div role="tablist" aria-label="Deal Categories" className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
              {CATEGORY_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const count = tab.id === 'saved' ? savedIds.length : dealsWithWatchlist.filter((d) => matchesTab(d, tab.id)).length;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      isActive ? 'bg-emerald-500 text-slate-950 font-semibold' : 'bg-[#0B0F17] text-slate-300 hover:text-slate-100 border border-slate-800/90'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`font-mono tabular-nums text-[11px] ${isActive ? 'text-slate-950/80' : 'text-slate-500'}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-[#0B0F17] border border-slate-800/90 rounded-lg px-4 py-2.5">
              <div className="flex items-center justify-between sm:justify-start gap-2.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <label htmlFor="discount-range-slider" className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0">
                  Min. marked discount:
                </label>
                <span className="font-mono tabular-nums text-xs font-bold text-emerald-400 whitespace-nowrap shrink-0">
                  {minDiscount === 0 ? 'Any' : `${minDiscount}%+`}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-1 sm:w-44">
                <span className="font-mono tabular-nums text-[11px] text-slate-500">0%</span>
                <input
                  id="discount-range-slider"
                  type="range"
                  min={0}
                  max={95}
                  step={5}
                  value={minDiscount}
                  onChange={(e) => setMinDiscount(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #10B981 0%, #10B981 ${(minDiscount / 95) * 100}%, #1E293B ${(minDiscount / 95) * 100}%, #1E293B 100%)`,
                  }}
                  className="discount-slider w-full h-1.5 rounded-lg"
                />
                <span className="font-mono tabular-nums text-[11px] text-slate-500">95%</span>
              </div>
              <div className="flex items-center gap-1">
                {[0, 30, 50, 70].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMinDiscount(preset)}
                    className={`px-2 py-1 rounded font-mono tabular-nums text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                      minDiscount === preset ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {preset === 0 ? 'Any' : `${preset}%+`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4">
            <div className="text-xs text-slate-400">Deals shown</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-100 mt-1">{metrics.activeCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">of {dealsWithWatchlist.length} watch-rule matches fetched</div>
          </div>
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4">
            <div className="text-xs text-slate-400">Possible price errors</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-400 mt-1">{metrics.priceErrorCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">70%+ off a marked $100+ price, or source says error</div>
          </div>
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4">
            <div className="text-xs text-slate-400">New since last scan</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-amber-300 mt-1">{metrics.newBotFindCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">{lastScannedAt ? `Last scan ${lastScannedAt}` : 'First scan running'}</div>
          </div>
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4">
            <div className="text-xs text-slate-400">Biggest marked discount</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-100 mt-1">{metrics.maxDiscount > 0 ? `${metrics.maxDiscount}% off` : '-'}</div>
            <div className="text-[11px] text-slate-500 mt-1">Only deals with a posted was/list price</div>
          </div>
        </section>

        <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-slate-200">GitHub Actions scanner (every 5 minutes)</div>
              <div className="text-slate-400 mt-1 leading-relaxed">
                {scannedAtPt ? `Last scan ${scannedAtPt}` : 'Waiting for the first scan JSON'}
                {dataOrigin ? ` · showing ${dataOrigin === 'live' ? 'live scanner-data JSON' : 'bundled data fallback'}` : ''}
                {` · ${workingSources} of ${sourceStatus.length || 0} sources ok`}
                {typeof newMatchCount === 'number' ? ` · ${newMatchCount} new this run` : ''}
                {baselineComplete === false ? ' · baseline not recorded yet' : ''}
                {discordDelivery === 'skipped-baseline' ? ' · baseline recorded without a Discord blast' : ''}
                {` · Discord ${discordConfigured ? 'secret present' : 'secret missing'} (${discordDelivery})`}
              </div>
              {rejectionReasons.length > 0 && (
                <div className="text-slate-500 mt-1.5 leading-relaxed">
                  Filtered {rejectionCount}: {rejectionReasons.slice(0, 4).map((row) => `${row.reason} (${row.count})`).join(' · ')}
                </div>
              )}
            </div>
          </div>
          <div className="lg:w-[420px] bg-[#0B0F17] border border-slate-800/90 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 mb-2">
              <ScrollText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Alerts log (latest {alertRows.length})</span>
            </div>
            {rejections.length > 0 && (
              <ul className="space-y-1 mb-2 max-h-20 overflow-y-auto">
                {rejections.slice(0, 4).map((row) => (
                  <li key={`${row.source}-${row.title}`} className="text-[11px] text-slate-500 leading-snug">
                    <span className="text-amber-200/90">{row.reason}</span>
                    {' · '}
                    {row.source}
                    <div className="truncate">{row.title}</div>
                  </li>
                ))}
              </ul>
            )}
            {alertRows.length === 0 ? (
              <div className="text-[11px] text-slate-500">No alerts yet. The first scan records a baseline and does not post that backlog to Discord.</div>
            ) : (
              <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {alertRows.slice(0, 8).map((row) => (
                  <li key={`${row.fingerprint}-${row.triggeredAt}`} className="text-[11px] text-slate-400 leading-snug">
                    <span className="font-mono text-slate-300">{row.triggeredAtPT}</span>
                    {' · '}
                    <span className="text-violet-300">{(row.ruleLabels || []).join(', ') || 'Watch'}</span>
                    {' · '}
                    <span className="text-sky-300">{row.condition}</span>
                    {' · '}${Number(row.price).toFixed(2)}
                    {row.was ? ` (was $${Number(row.was).toFixed(2)})` : ''}
                    {' · '}
                    {row.store || row.retailer}
                    {' · '}
                    <span className={row.discordStatus === 'sent' ? 'text-emerald-400' : 'text-amber-300'}>{row.discordStatus}</span>
                    <div className="text-slate-500 truncate">{row.title}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {scanError && (
          <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-red-200">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{scanError}</span>
            </div>
            <button type="button" onClick={() => refreshLiveData(false)} className="px-3 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-100 whitespace-nowrap shrink-0">
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800/90 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Showing <strong className="font-mono tabular-nums text-slate-100">{filteredDeals.length}</strong> live deals
                  {activeSources.length > 0 && ` from ${activeSources.length} selected source(s)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <label htmlFor="sort-deals" className="text-xs text-slate-400">
                  Sort:
                </label>
                <select
                  id="sort-deals"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-[#0B0F17] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="substance-desc">Best first (errors, % off, votes, recency)</option>
                  <option value="recent">Most recently posted</option>
                  <option value="discount-desc">Highest marked % off</option>
                  <option value="savings-desc">Largest $ savings</option>
                  <option value="price-asc">Lowest price</option>
                </select>
              </div>
            </div>

            {isScanning && deals.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="bg-[#111827] border border-slate-800/90 rounded-xl p-5 space-y-4 animate-pulse">
                    <div className="h-3 bg-slate-800 rounded w-2/3" />
                    <div className="h-5 bg-slate-800 rounded w-full" />
                    <div className="h-4 bg-slate-800/70 rounded w-4/5" />
                    <div className="h-16 bg-[#0B0F17] border border-slate-800/80 rounded-lg" />
                    <div className="h-9 bg-slate-800 rounded-lg w-full" />
                  </div>
                ))}
              </div>
            ) : filteredDeals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} isSaved={savedIds.includes(deal.id)} onToggleSave={handleToggleSave} />
                ))}
              </div>
            ) : (
              <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-10 text-center space-y-4">
                <h3 className="font-display text-base font-semibold text-slate-200">
                  {activeTab === 'price-errors' ? 'No possible price errors right now' : 'No live deals match these filters'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Only posts with a clearly marked was/list price get a % off, so high discount filters show fewer deals. Check the X search links in the sidebar for glitches people are posting right now.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 transition-colors">
                    Show all deals
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshLiveData(false)}
                    disabled={isScanning}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <Rss className="w-3.5 h-3.5" />
                    <span>Refresh feeds</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4">
            <LiveGlitchRadarSidebar
              deals={dealsWithWatchlist}
              activeSources={activeSources}
              onToggleSource={handleToggleSource}
              onClearSources={() => setActiveSources([])}
              sourceStatus={sourceStatus}
              xPosts={xPosts}
              xSearchLinks={xSearchLinks}
              xAccounts={xAccounts}
              lastScannedAt={lastScannedAt}
              isScanning={isScanning}
              onSelectDealQuickJump={handleQuickJump}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800/80 py-6 px-6 mt-12">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>GlitchHunter · zero AI · prices come from public deal posts. Stores often cancel price-mistake orders — confirm the price in your cart.</div>
          <div>Sources: Slickdeals · Reddit · Woot · Meh · DealNews · 9to5Toys · TechBargains · Ben&apos;s Bargains · X</div>
        </div>
      </footer>
    </div>
  );
}
