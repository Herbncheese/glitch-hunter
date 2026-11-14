import React, { useState } from 'react';
import { ExternalLink, Copy, Check, Bookmark, ShieldCheck, Search, AlertTriangle, MessageSquare } from 'lucide-react';
import { GlitchDeal, GroundingCitation, CheckPriceLink, PriceBasis } from '../types/deals';

interface DealCardProps {
  deal: GlitchDeal;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
}

interface PriceCheckReport {
  mode: 'links-only' | 'error';
  model?: string;
  summary: string;
  checkPriceLinks: CheckPriceLink[];
  citations: GroundingCitation[];
}

const BASIS_LABEL: Record<PriceBasis, string> = {
  none: '',
  equation: 'poster math (was - discount = now)',
  'labeled-was': 'was/reg/list/MSRP price in post',
  'from-to': '"from $X to $Y" in post',
  strikethrough: 'crossed-out price in post',
  'dollars-off': '"$X off" stated in post',
  'percent-off': '"X% off" stated in post',
  'retailer-list-price': "retailer's own list price",
};

export function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export const DealCard: React.FC<DealCardProps> = ({ deal, isSaved, onToggleSave }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [report, setReport] = useState<PriceCheckReport | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const hasDiscount = deal.discountPercent > 0 && deal.originalPrice > deal.glitchPrice;
  const savingsAmount = hasDiscount ? deal.originalPrice - deal.glitchPrice : 0;
  const postedAt = new Date(deal.detectedTimestamp);

  const handleCopyCoupon = () => {
    if (!deal.couponCode) return;
    navigator.clipboard.writeText(deal.couponCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handlePriceCheck = () => {
    if (report) {
      setReport(null);
      return;
    }
    setVerifyError(null);
    setReport({
      mode: 'links-only',
      summary:
        'This scanner is 100% AI-free. Use the camelcamelcamel, Keepa, and Google Shopping links to confirm the current and typical price yourself. Numbers on this page come only from the original deal post.',
      checkPriceLinks: deal.checkPriceLinks,
      citations: [],
    });
  };

  const badgeClass = deal.isPossiblePriceError
    ? 'bg-red-500/15 text-red-300 border border-red-500/40'
    : deal.discountPercent >= 40
    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30';

  return (
    <article
      className={`bg-[#111827] border rounded-xl p-5 flex flex-col justify-between transition-colors duration-150 ${
        deal.isPossiblePriceError
          ? 'border-red-500/50 hover:border-red-400'
          : deal.isNewBotFind
          ? 'border-emerald-500/60 hover:border-emerald-400'
          : 'border-slate-800/90 hover:border-slate-700'
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-3 text-xs text-slate-400 mb-2.5">
          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
            {deal.isNewBotFind && (
              <>
                <span className="font-mono font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] tracking-tight">NEW</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-semibold text-slate-200">{deal.retailer}</span>
            <span aria-hidden="true">·</span>
            <a href={deal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-medium hover:underline">
              {deal.sourceChannel}
            </a>
            {typeof deal.upvoteScore === 'number' && deal.upvoteScore > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-amber-300 font-semibold">↑{deal.upvoteScore}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-400" title={deal.seenAtPT || postedAt.toLocaleString()}>
              {deal.seenAtPT ? `seen ${deal.seenAtPT}` : `posted ${timeAgo(deal.detectedTimestamp)}`}
            </span>
            {deal.skuOrAsin && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-500 truncate">{deal.skuOrAsin}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => onToggleSave(deal.id)}
            aria-label={isSaved ? 'Remove from saved' : 'Save deal'}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${isSaved ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'}`}
          >
            <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>

        <h3 className="font-display text-base font-semibold text-slate-100 leading-snug mb-2">{deal.title}</h3>

        <div className="flex flex-wrap gap-1.5 mb-2">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              deal.condition === 'Unverified condition' || !deal.condition
                ? 'bg-slate-800 text-slate-300 border-slate-600'
                : deal.condition === 'New'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            {deal.condition || 'Unverified condition'}
          </span>
          {deal.hotCategory && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
              Hot
            </span>
          )}
          {(deal.matchedRules || []).map((rule) => (
            <span key={rule.ruleId + rule.reason} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30" title={rule.reason}>
              {rule.label}
            </span>
          ))}
          {deal.matchedWatchlistKeywords && deal.matchedWatchlistKeywords.length > 0 && (
            <span className="text-[11px] text-amber-300 font-medium">Watchlist: {deal.matchedWatchlistKeywords.join(' · ')}</span>
          )}
        </div>

        {(deal.matchedRules || []).length > 0 && (
          <div className="mb-3 text-[11px] text-slate-400 leading-relaxed">
            {(deal.matchedRules || []).map((rule) => (
              <div key={rule.ruleId}>Rule match: {rule.reason}</div>
            ))}
          </div>
        )}

        {deal.isPossiblePriceError && deal.priceErrorReason && (
          <div className="mb-3 text-[11px] text-red-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Possible price error: {deal.priceErrorReason}. Retailers often cancel these; check the price in your cart.
            </span>
          </div>
        )}

        {deal.specsSummary && <p className="text-xs text-slate-400 leading-relaxed mb-4">{deal.specsSummary}</p>}

        <div className="bg-[#0B0F17] border border-slate-800/80 rounded-lg p-3.5 mb-4">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-3">
              <div>
                <span className="block text-[11px] text-slate-500 mb-0.5">Posted price</span>
                <span className="font-mono tabular-nums text-2xl font-bold text-emerald-400 tracking-tight">${deal.glitchPrice.toFixed(2)}</span>
              </div>
              {hasDiscount && (
                <div>
                  <span className="block text-[11px] text-slate-500 mb-0.5">Was</span>
                  <span className="font-mono tabular-nums text-sm text-slate-500 line-through">${deal.originalPrice.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="text-right">
              {hasDiscount ? (
                <>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-mono tabular-nums text-xs font-bold tracking-tight ${badgeClass}`}>
                    {deal.discountPercent}% OFF · {deal.glitchType}
                  </span>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">Save ${savingsAmount.toFixed(2)}</div>
                </>
              ) : (
                <>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-mono tabular-nums text-xs font-semibold tracking-tight ${deal.isPossiblePriceError ? badgeClass : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                    {deal.glitchType}
                  </span>
                  <div className="text-[11px] text-slate-500 mt-1">No was-price posted</div>
                </>
              )}
            </div>
          </div>
          {hasDiscount && BASIS_LABEL[deal.priceBasis] && (
            <div className="text-[10px] text-slate-500 mt-2">% off based on: {BASIS_LABEL[deal.priceBasis]}</div>
          )}
        </div>

        {deal.couponCode && (
          <div className="mb-4 text-xs bg-slate-900/70 border border-slate-800/80 rounded-lg p-3 flex items-center justify-between gap-2">
            <span className="text-slate-400">{deal.stackInstructions}</span>
            <button
              type="button"
              onClick={handleCopyCoupon}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              <span>{copiedCode ? 'Copied' : deal.couponCode}</span>
            </button>
          </div>
        )}

        <div className="mb-4 flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span>Check price:</span>
          {deal.checkPriceLinks.map((l, idx) => (
            <React.Fragment key={l.uri}>
              {idx > 0 && <span aria-hidden="true">·</span>}
              <a href={l.uri} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400 underline decoration-slate-700 hover:decoration-emerald-400 transition-colors">
                {l.label}
              </a>
            </React.Fragment>
          ))}
        </div>

        {verifyError && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-800/50 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{verifyError}</span>
          </div>
        )}

        {report && (
          <div className="mb-4 p-3.5 rounded-lg bg-[#0B0F17] border border-emerald-500/30 text-xs space-y-2">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              {'Price check links'}
            </div>
            <p className="text-slate-300 whitespace-pre-line leading-relaxed">{report.summary}</p>
            {report.citations.length > 0 && (
              <ul className="space-y-1">
                {report.citations.map((c) => (
                  <li key={c.uri} className="truncate">
                    <a href={c.uri} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-400 underline">
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handlePriceCheck}
          className="px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Search className="w-3.5 h-3.5 text-emerald-400" />
          <span>{report ? 'Hide check' : 'Check price'}</span>
        </button>
        <a
          href={deal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
          <span>Source</span>
        </a>
        <a
          href={deal.directBuyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>Open deal</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </article>
  );
};
