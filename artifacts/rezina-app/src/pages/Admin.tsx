import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  BarChart3, Inbox, Settings, Mail, LogOut, CheckCircle,
  Clock, Trash2, Eye, RefreshCw, ChevronDown, AlertCircle, Save,
} from 'lucide-react';

const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}/api`;

// ─── Types ─────────────────────────────────────────────────────────────────

interface AdminReport {
  id: number;
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  status: string;
  resolvedVotes: number;
  photoBase64: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  pending: number;
  resolved: number;
  recent: number;
  byCategory: Record<string, number>;
}

interface CategoryConfig {
  label: string;
  icon: string;
  color: string;
  authorityName: string;
  authorityEmail: string;
}

interface EmailConfig {
  EMAIL_POLITIE: string;
  EMAIL_ECOLOGIE: string;
  EMAIL_REDNORD: string;
  EMAIL_PRIMARIE: string;
  EMAIL_APA: string;
  EMAIL_COMUNALE: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_FROM: string;
  smtpConfigured: boolean;
}

type NavTab = 'dashboard' | 'reports' | 'categories' | 'emails';

// ─── API helpers ────────────────────────────────────────────────────────────

function adminFetch(path: string, password: string, opts: RequestInit = {}) {
  return fetch(`${API_BASE}/admin${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': password,
      ...(opts.headers || {}),
    },
  });
}

// ─── Login ──────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        sessionStorage.setItem('admin_pw', pw);
        onLogin(pw);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Parolă incorectă');
      }
    } catch {
      setError('Eroare de conexiune la server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">🏙️ Rezina Smart City</h1>
          <p className="text-muted-foreground text-sm mt-1">Panou de administrare</p>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="space-y-1.5">
            <Label htmlFor="pw">Parolă administrator</Label>
            <Input
              id="pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Introduceți parola…"
              autoFocus
              required
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-2.5 border border-destructive/20">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Se verifică…' : 'Conectare'}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Setați <code className="bg-muted px-1 rounded">ADMIN_PASSWORD</code> în Secrets
        </p>
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      status === 'resolved'
        ? 'bg-green-500/15 text-green-400 border border-green-500/20'
        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
    )}>
      {status === 'resolved' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {status === 'resolved' ? 'Remediat' : 'În așteptare'}
    </span>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

function AdminPanel({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [tab, setTab] = useState<NavTab>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryConfig>>({});
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [editedCategories, setEditedCategories] = useState<Record<string, CategoryConfig>>({});
  const [catSaveMsg, setCatSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reportsRes, configRes] = await Promise.all([
        adminFetch('/stats', password),
        adminFetch('/reports', password),
        adminFetch('/config', password),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());
      if (configRes.ok) {
        const cfg = await configRes.json();
        setCategories(cfg.categories);
        setEditedCategories(JSON.parse(JSON.stringify(cfg.categories)));
        setEmailConfig(cfg.emailConfig);
      }
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: number, status: string) => {
    const res = await adminFetch(`/reports/${id}`, password, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setReports((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
      if (expandedReport === id) setExpandedReport(null);
    }
  };

  const deleteReport = async (id: number) => {
    if (!confirm('Sigur doriți să ștergeți această sesizare?')) return;
    const res = await adminFetch(`/reports/${id}`, password, { method: 'DELETE' });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (expandedReport === id) setExpandedReport(null);
    }
  };

  const saveCategories = async () => {
    const res = await adminFetch('/config/categories', password, {
      method: 'PUT',
      body: JSON.stringify(editedCategories),
    });
    if (res.ok) {
      setCategories(JSON.parse(JSON.stringify(editedCategories)));
      setCatSaveMsg('Salvat cu succes ✓');
      setTimeout(() => setCatSaveMsg(''), 3000);
    } else {
      setCatSaveMsg('Eroare la salvare');
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    return true;
  });

  const allCategories = Object.keys(categories);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Nav */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base sm:text-lg font-bold text-primary truncate">🏙️ Rezina</span>
            <span className="hidden sm:inline text-muted-foreground text-sm flex-shrink-0">Smart City / Admin</span>
            <span className="sm:hidden text-muted-foreground text-xs flex-shrink-0">Admin</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="px-2">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground px-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Ieșire</span>
            </Button>
          </div>
        </div>
        {/* Tab bar — scrollable, no visible scrollbar */}
        <div
          className="max-w-6xl mx-auto px-3 sm:px-4 flex gap-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {([
            ['dashboard', 'Dashboard', BarChart3],
            ['reports', 'Sesizări', Inbox],
            ['categories', 'Categorii', Settings],
            ['emails', 'Email / SMTP', Mail],
          ] as [NavTab, string, React.ElementType][]).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                tab === id
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="max-w-6xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">

        {/* ─── Dashboard ─── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Sumar general</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total sesizări" value={stats?.total ?? 0} color="bg-primary/10 text-primary" icon={<Inbox className="w-5 h-5" />} />
              <StatCard label="În așteptare" value={stats?.pending ?? 0} color="bg-amber-500/10 text-amber-400" icon={<Clock className="w-5 h-5" />} />
              <StatCard label="Remediate" value={stats?.resolved ?? 0} color="bg-green-500/10 text-green-400" icon={<CheckCircle className="w-5 h-5" />} />
              <StatCard label="Ultimele 30 zile" value={stats?.recent ?? 0} color="bg-purple-500/10 text-purple-400" icon={<BarChart3 className="w-5 h-5" />} />
            </div>

            {stats && Object.keys(stats.byCategory).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wider">Sesizări per categorie</h3>
                <div className="space-y-2">
                  {Object.entries(stats.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => {
                      const cfg = categories[cat];
                      const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="text-base w-6">{cfg?.icon ?? '📋'}</span>
                          <span className="text-sm flex-1 truncate">{cfg?.label ?? cat}</span>
                          <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {stats?.total === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nicio sesizare înregistrată încă.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Reports Table ─── */}
        {tab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-xl font-bold flex-1">Sesizări ({filteredReports.length})</h2>
              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 text-foreground"
                >
                  <option value="all">Toate statusurile</option>
                  <option value="pending">În așteptare</option>
                  <option value="resolved">Remediate</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 text-foreground"
                >
                  <option value="all">Toate categoriile</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>{categories[c]?.label ?? c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredReports.length === 0 && (
                <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
                  <Inbox className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nicio sesizare găsită.</p>
                </div>
              )}
              {filteredReports.map((r) => {
                const cfg = categories[r.category];
                const isExpanded = expandedReport === r.id;
                return (
                  <div key={r.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div
                      className="flex items-start gap-3 p-4 cursor-pointer hover:bg-accent/5 transition-colors"
                      onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                    >
                      <span className="text-xl mt-0.5">{cfg?.icon ?? '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{r.title}</span>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{cfg?.label ?? r.category}</span>
                          <span>#{String(r.id).padStart(5, '0')}</span>
                          <span>{new Date(r.createdAt).toLocaleDateString('ro-MD')}</span>
                          {r.reporterName && <span>{r.reporterName}</span>}
                        </div>
                      </div>
                      <ChevronDown className={cn('w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform mt-1', isExpanded && 'rotate-180')} />
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                        <p className="text-sm leading-relaxed bg-accent/5 rounded-lg p-3 border border-border">{r.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div><span className="font-medium text-foreground">GPS:</span> {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</div>
                          {r.address && <div><span className="font-medium text-foreground">Adresă:</span> {r.address}</div>}
                          {r.reporterEmail && <div><span className="font-medium text-foreground">Email:</span> {r.reporterEmail}</div>}
                          <div><span className="font-medium text-foreground">Voturi remediere:</span> {r.resolvedVotes}/3</div>
                        </div>

                        {r.photoBase64 && (
                          <img src={r.photoBase64} alt="Poză" className="w-full max-h-48 object-contain rounded-lg border border-border bg-black/20" />
                        )}

                        <a
                          href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Vizualizează pe Google Maps
                        </a>

                        <div className="flex gap-2 pt-1 flex-wrap">
                          {r.status === 'pending' ? (
                            <Button size="sm" variant="outline" className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => updateStatus(r.id, 'resolved')}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Marchează remediat
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                              onClick={() => updateStatus(r.id, 'pending')}>
                              <Clock className="w-3.5 h-3.5 mr-1" />
                              Redeschide sesizarea
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => deleteReport(r.id)}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Șterge
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Category Management ─── */}
        {tab === 'categories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Categorii sesizări</h2>
              <div className="flex items-center gap-3">
                {catSaveMsg && (
                  <span className={cn('text-sm', catSaveMsg.includes('Eroare') ? 'text-destructive' : 'text-green-400')}>
                    {catSaveMsg}
                  </span>
                )}
                <Button size="sm" onClick={saveCategories}>
                  <Save className="w-4 h-4 mr-1.5" />
                  Salvează
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Editați etichetele, iconițele, culorile și emailul autorității pentru fiecare categorie.
              Modificările intră în vigoare imediat după salvare.
            </p>

            <div className="space-y-3">
              {Object.entries(editedCategories).map(([key, cfg]) => (
                <div key={key} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cfg.icon}</span>
                    <div>
                      <div className="font-medium text-sm">{cfg.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{key}</div>
                    </div>
                    <div
                      className="ml-auto w-6 h-6 rounded-full border-2 border-white/20 flex-shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Etichetă</Label>
                      <Input
                        value={cfg.label}
                        onChange={(e) => setEditedCategories((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], label: e.target.value },
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Iconiță (emoji)</Label>
                      <Input
                        value={cfg.icon}
                        onChange={(e) => setEditedCategories((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], icon: e.target.value },
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Autoritate competentă</Label>
                      <Input
                        value={cfg.authorityName}
                        onChange={(e) => setEditedCategories((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], authorityName: e.target.value },
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email autoritate</Label>
                      <Input
                        type="email"
                        value={cfg.authorityEmail}
                        onChange={(e) => setEditedCategories((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], authorityEmail: e.target.value },
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Culoare pin hartă</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={cfg.color}
                          onChange={(e) => setEditedCategories((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], color: e.target.value },
                          }))}
                          className="h-8 w-12 rounded border border-border cursor-pointer bg-transparent"
                        />
                        <Input
                          value={cfg.color}
                          onChange={(e) => setEditedCategories((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], color: e.target.value },
                          }))}
                          className="h-8 text-sm font-mono flex-1"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Email / SMTP Config ─── */}
        {tab === 'emails' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Configurare email / SMTP</h2>

            {/* SMTP status */}
            <div className={cn(
              'flex items-center gap-3 p-4 rounded-xl border',
              emailConfig?.smtpConfigured
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            )}>
              {emailConfig?.smtpConfigured
                ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
                : <AlertCircle className="w-5 h-5 flex-shrink-0" />
              }
              <div>
                <div className="font-semibold text-sm">
                  {emailConfig?.smtpConfigured ? 'SMTP configurat — emailuri active' : 'SMTP neconfigurat — emailuri inactive'}
                </div>
                <div className="text-xs opacity-80">
                  {emailConfig?.smtpConfigured
                    ? 'Sesizările se trimit automat prin email la autorități.'
                    : 'Setați SMTP_HOST, SMTP_USER, SMTP_PASS în Secrets pentru a activa emailurile.'}
                </div>
              </div>
            </div>

            {/* SMTP values */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Server SMTP</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['SMTP_HOST', emailConfig?.SMTP_HOST],
                  ['SMTP_PORT', emailConfig?.SMTP_PORT],
                  ['SMTP_USER', emailConfig?.SMTP_USER],
                  ['SMTP_FROM', emailConfig?.SMTP_FROM],
                ].map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground">{k}</Label>
                    <div className="text-sm bg-muted/40 rounded-lg px-3 py-2 font-mono border border-border">
                      {v || <span className="text-muted-foreground italic">(nesetat)</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Valorile SMTP se setează în <strong>Secrets</strong> (variabile de mediu) — nu pot fi modificate din panou.
              </p>
            </div>

            {/* Authority emails */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Emailuri autorități</h3>
              <p className="text-xs text-muted-foreground">
                Emailurile se configurează prin variabile de mediu în Secrets.
                Pentru a le modifica dinamic per categorie, folosiți tab-ul <strong>Categorii</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {emailConfig && [
                  ['EMAIL_POLITIE', emailConfig.EMAIL_POLITIE, 'Poliția Rezina'],
                  ['EMAIL_ECOLOGIE', emailConfig.EMAIL_ECOLOGIE, 'Secția Ecologie'],
                  ['EMAIL_REDNORD', emailConfig.EMAIL_REDNORD, 'Rednord SA'],
                  ['EMAIL_PRIMARIE', emailConfig.EMAIL_PRIMARIE, 'Primăria Rezina'],
                  ['EMAIL_APA', emailConfig.EMAIL_APA, 'Apă Canal Rezina'],
                  ['EMAIL_COMUNALE', emailConfig.EMAIL_COMUNALE, 'Servicii Comunale'],
                ].map(([key, val, name]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{name}</Label>
                    <div className="text-sm bg-muted/40 rounded-lg px-3 py-2 border border-border flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-mono text-xs truncate">{val}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Env var instructions */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cum configurați</h3>
              <ol className="text-sm space-y-1.5 text-muted-foreground list-decimal list-inside">
                <li>Deschideți <strong>Secrets</strong> în Replit (lacăt din bara laterală)</li>
                <li>Adăugați variabilele de mai sus cu valorile reale</li>
                <li>Reporniți serverul API pentru a prelua noile valori</li>
              </ol>
              <div className="mt-3 bg-muted/40 rounded-lg p-3 font-mono text-xs space-y-1 border border-border">
                {['SMTP_HOST=smtp.gmail.com', 'SMTP_PORT=587', 'SMTP_USER=adresa@gmail.com', 'SMTP_PASS=parola_aplicatie', 'ADMIN_PASSWORD=parola_ta_admin'].map((l) => (
                  <div key={l} className="text-muted-foreground">{l}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      <footer className="border-t border-border py-2 text-center text-xs text-muted-foreground flex-shrink-0">
        Rezina Smart City · Admin · <strong>Pavel Dordea</strong>
      </footer>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Admin() {
  const [password, setPassword] = useState<string | null>(() => sessionStorage.getItem('admin_pw'));

  const handleLogin = (pw: string) => setPassword(pw);
  const handleLogout = () => {
    sessionStorage.removeItem('admin_pw');
    setPassword(null);
  };

  if (!password) return <LoginScreen onLogin={handleLogin} />;
  return <AdminPanel password={password} onLogout={handleLogout} />;
}
