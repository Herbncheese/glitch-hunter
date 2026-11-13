import React from 'react';
import { ExternalLink, RefreshCw, Filter, Globe } from 'lucide-react';
import { X_DEAL_ACCOUNTS, X_SEARCH_LINKS } from '../data/xLinks';
import { GlitchDeal, SourceStatus, XGlitchPost, XSearchLink } from '../types/deals';
import { timeAgo } from './DealCard';

interface LiveGlitchRadarSidebarProps {
  deals: GlitchDeal[];
  activeSources: string[];
  onToggleSource: (source: string) => void;
  onClearSources: () => void;
  sourceStatus: SourceStatus[];
  xPosts: XGlitchPost[];
  xSearchLinks: XSearchLink[];
  xAccounts?: XSearchLink[];
  lastScannedAt: string;
  isScanning: boolean;
  onSelectDealQuickJump: (deal: GlitchDeal) => void;
}

const STATE_STYLE: Record<string, string> = {
  ok: 'text-emerald-400',
  cached: 'text-amber-300',
  empty: 'text-slate-400',
  'rate-limited': 'text-amber-300',
  blocked: 'text-red-400',
  error: 'text-red-400',
  'not-configured': 'text-slate-500',
};

export const LiveGlitchRadarSidebar: React.FC<LiveGlitchRadarSidebarProps> = ({
  deals,
  activeSources,
  onToggleSource,
  onClearSources,
  sourceStatus,
  xPosts,
  xSearchLinks,
  xAccounts = [],
  lastScannedAt,
  isScanning,
  onSelectDealQuickJump,
}) => {
  // Price errors first, then biggest marked discount, then newest
  const topDeals = [...deals]
    .sort((a, b) => {
      if (a.isPossiblePriceError !== b.isPossiblePriceError) return a.isPossiblePriceError ? -1 : 1;
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      return b.detectedTimestamp - a.detectedTimestamp;
    })
    .slice(0, 7);

  // Source filter options are built from the deals actually fetched (real counts)
  const channelCounts = Array.from(
    deals.reduce((m, d) => m.set(d.sourceChannel, (m.get(d.sourceChannel) || 0) + 1), new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);
  const accounts = xAccounts.length ? xAccounts : X_DEAL_ACCOUNTS;
  const searches = xSearchLinks.length ? xSearchLinks : X_SEARCH_LINKS;

  return (
    <aside className="space-y-6">
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 pb-3.5 mb-4 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">Top Signals</h2>
            <p className="text-xs text-slate-400 mt-0.5">{lastScannedAt ? `Last scan ${lastScannedAt}` : 'Scanning...'}</p>
          </div>
          {isScanning && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />}
        </div>
        <div className="divide-y divide-slate-800/70">
          {topDeals.length === 0 && <p className="text-xs text-slate-500">No deals yet.</p>}
          {topDeals.map((item) => (
            <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-0.5 flex-wrap">
                  {item.isPossiblePriceError && <span className="font-mono font-bold text-red-300">[ERROR?]</span>}
                  {item.isNewBotFind && <span className="font-mono font-bold text-emerald-300">[NEW]</span>}
                  <span className="text-emerald-400 font-medium">{item.sourceChannel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.retailer}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-500">{timeAgo(item.detectedTimestamp)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectDealQuickJump(item)}
                  className="text-left text-xs font-medium text-slate-200 group-hover:text-emerald-300 transition-colors line-clamp-1"
                >
                  {item.title}
                </button>
                <div className="flex items-center gap-2 mt-1 font-mono tabular-nums text-xs">
                  <span className="font-bold text-emerald-400">${item.glitchPrice.toFixed(2)}</span>
                  {item.discountPercent > 0 ? (
                    <>
                      <span className="text-slate-500 line-through text-[11px]">${item.originalPrice.toFixed(2)}</span>
                      <span className="text-amber-300 font-semibold text-[11px]">-{item.discountPercent}%</span>
                    </>
                  ) : (
                    <span className="text-slate-500 text-[11px]">single price</span>
                  )}
                </div>
              </div>
              <a
                href={item.directBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${item.title}`}
                className="p-1.5 rounded-lg border border-slate-800 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 transition-colors shrink-0 mt-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-5">
        <div className="pb-3 mb-3 border-b border-slate-800/80">
          <h2 className="font-display text-sm font-semibold text-slate-100">X deal accounts and glitch searches</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manual links only. This scanner does not call the X API.</p>
        </div>
        <ul className="space-y-1.5 text-xs mb-3">
          {accounts.map((account) => (
            <li key={account.uri}>
              <a href={account.uri} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-emerald-400 underline decoration-slate-700 inline-flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                <span>{account.label}</span>
              </a>
            </li>
          ))}
        </ul>
        {xPosts.length > 0 && (
          <ul className="space-y-2.5 mb-4">
            {xPosts.slice(0, 8).map((p) => (
              <li key={p.id} className="text-xs">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-emerald-300 line-clamp-2">
                  {p.text}
                </a>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  @{p.author} · {timeAgo(Date.parse(p.createdAt))}
                  {typeof p.likes === 'number' ? ` · ${p.likes} likes` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
        <ul className="space-y-1.5 text-xs">
          {searches.map((l) => (
            <li key={l.uri}>
              <a href={l.uri} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 underline decoration-slate-700 inline-flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                <span>{l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section id="source-monitor" className="bg-[#111827] border border-slate-800/90 rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 pb-3.5 mb-3.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <h2 className="font-display text-sm font-semibold text-slate-100">Filter by source ({channelCounts.length})</h2>
          </div>
          {activeSources.length > 0 && (
            <button type="button" onClick={onClearSources} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0">
              Reset ({activeSources.length})
            </button>
          )}
        </div>
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {channelCounts.map(([channel, count]) => {
            const isSelected = activeSources.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                onClick={() => onToggleSource(channel)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between gap-2 ${
                  isSelected ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' : 'bg-[#0B0F17]/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="font-medium truncate">{channel}</span>
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-300">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-5">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/80">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <h2 className="font-display text-sm font-semibold text-slate-100">Source status (last scan)</h2>
        </div>
        <ul className="space-y-2 text-xs">
          {sourceStatus.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 underline decoration-slate-700 block truncate">
                  {s.label}
                </a>
                {s.message && <div className="text-[10px] text-slate-500 leading-snug">{s.message}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className={`font-mono text-[11px] font-semibold ${STATE_STYLE[s.state] || 'text-slate-400'}`}>{s.state}</div>
                <div className="font-mono text-[10px] text-slate-500">
                  {s.itemsFetched} in · {s.dealsKept} kept
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
};
