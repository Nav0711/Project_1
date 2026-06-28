import { useEffect, useState } from 'react';
import {
  CheckCircle2, Loader2, Circle, XCircle,
  Building2, ShieldAlert, FileCheck2, Newspaper,
  Star, Globe, MapPin, Sparkles,
} from 'lucide-react';
import { Skeleton } from './Skeleton';

type Stage = { icon: React.ComponentType<{ className?: string }>; label: string; sublabel: string };

const STAGES: Stage[] = [
  { icon: Building2,   label: 'Corporate Registry',        sublabel: 'OpenCorporates lookup' },
  { icon: ShieldAlert, label: 'Sanctions & PEP Screening', sublabel: 'OpenSanctions watchlists' },
  { icon: FileCheck2,  label: 'Tax & GST Verification',    sublabel: 'AuthBridge GSTIN / PAN / MSME' },
  { icon: Newspaper,   label: 'Adverse Media',             sublabel: 'GDELT + NewsAPI' },
  { icon: Star,        label: 'Reviews & Profile',         sublabel: 'Trustpilot, Glassdoor, G2' },
  { icon: Globe,       label: 'Domain Intelligence',       sublabel: 'WHOIS, SSL, Microlink' },
  { icon: MapPin,      label: 'Address & Footprint',       sublabel: 'Google Places' },
  { icon: Sparkles,    label: 'AI Risk Analysis',          sublabel: 'Claude synthesis' },
];

const STEP_MS = 2200;

const ScanLoading = ({ onCancel }: { onCancel: () => void }) => {
  // Auto-advance through the stages; cap at the last one (it keeps "running"
  // until the parent swaps in the completed dashboard).
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => Math.min(i + 1, STAGES.length - 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12">
      {/* ── Header card with progress ─────────────────────────────────────── */}
      <div className="bg-card border rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Running Deep Diligence…</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI agents are querying multiple intelligence sources in parallel.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-destructive transition-colors shrink-0"
          >
            <XCircle className="w-4 h-4 mr-1.5" /> Cancel
          </button>
        </div>

        {/* Indeterminate progress bar */}
        <div className="mt-4 w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.round(((active + 1) / STAGES.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* ── Stage checklist ───────────────────────────────────────────────── */}
      <div className="bg-card border rounded-xl shadow-sm divide-y">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const state = i < active ? 'done' : i === active ? 'active' : 'pending';
          return (
            <div
              key={s.label}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                state === 'active' ? 'bg-primary/5' : ''
              }`}
            >
              <span className="shrink-0">
                {state === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {state === 'active' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                {state === 'pending' && <Circle className="w-5 h-5 text-muted-foreground/30" />}
              </span>

              <Icon
                className={`w-4 h-4 shrink-0 ${
                  state === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground'
                }`}
              />

              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium truncate ${
                    state === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'
                  }`}
                >
                  {s.label}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{s.sublabel}</div>
              </div>

              <span className="text-[10px] uppercase tracking-wider font-semibold shrink-0">
                {state === 'done' && <span className="text-emerald-500">Done</span>}
                {state === 'active' && <span className="text-primary">Running…</span>}
                {state === 'pending' && <span className="text-muted-foreground/40">Queued</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Skeleton preview of the report being assembled ────────────────── */}
      <div className="flex gap-2 border-b border-border pb-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          {Array.from({ length: 3 }).map((_, r) => (
            <div key={r} className="flex items-center justify-between gap-4">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ScanLoading;