import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as L from 'leaflet';
import { Camera, MapPin, Loader2, Plus, CheckCircle, Mail } from 'lucide-react';
import {
  useListReports,
  useCreateReport,
  useVoteResolved,
  getListReportsQueryKey,
  type Report,
  ReportCategory,
  type ReportInputCategory,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Map configuration
const REZINA_COORDS: [number, number] = [47.7478, 28.9628];
const DEFAULT_ZOOM = 14;

// All categories with full metadata
export const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: string;
  color: string;
  authorityName: string;
  defaultTitle: string;
}> = {
  [ReportCategory.parking]: {
    label: 'Parcare neregulamentară',
    icon: '🚗',
    color: '#E53935',
    authorityName: 'Poliția Rezina',
    defaultTitle: 'Parcare neregulamentară pe str.',
  },
  accident_traffic: {
    label: 'Accident / Acțiuni în trafic',
    icon: '🚨',
    color: '#D32F2F',
    authorityName: 'Poliția Rezina',
    defaultTitle: 'Accident rutier / situație periculoasă pe str.',
  },
  sewage: {
    label: 'Canalizare astupată',
    icon: '🪣',
    color: '#6D4C41',
    authorityName: 'Apă Canal Rezina',
    defaultTitle: 'Canalizare astupată / revărsată pe str.',
  },
  garbage_road: {
    label: 'Gunoi pe drum / trotuare',
    icon: '♻️',
    color: '#795548',
    authorityName: 'Servicii Comunale Rezina',
    defaultTitle: 'Gunoi necolectat pe str.',
  },
  [ReportCategory.tree]: {
    label: 'Copac / Crengi căzute',
    icon: '🌳',
    color: '#43A047',
    authorityName: 'Secția Ecologie Rezina',
    defaultTitle: 'Copac / crengi căzute pe str.',
  },
  [ReportCategory.electricity]: {
    label: 'Probleme electricitate',
    icon: '⚡',
    color: '#FFB300',
    authorityName: 'Rednord SA',
    defaultTitle: 'Defecțiune la rețeaua electrică pe str.',
  },
  [ReportCategory.road]: {
    label: 'Drum deteriorat',
    icon: '🕳️',
    color: '#757575',
    authorityName: 'Primăria Rezina',
    defaultTitle: 'Drum deteriorat / groapă periculoasă pe str.',
  },
  [ReportCategory.water]: {
    label: 'Probleme apă',
    icon: '💧',
    color: '#1E88E5',
    authorityName: 'Apă Canal Rezina',
    defaultTitle: 'Defecțiune la rețeaua de apă pe str.',
  },
  [ReportCategory.garbage]: {
    label: 'Depozitare ilegală de deșeuri',
    icon: '🗑️',
    color: '#8D6E63',
    authorityName: 'Servicii Comunale Rezina',
    defaultTitle: 'Depozitare ilegală de deșeuri pe str.',
  },
  lighting: {
    label: 'Iluminat stradal defect',
    icon: '💡',
    color: '#F9A825',
    authorityName: 'Primăria Rezina',
    defaultTitle: 'Iluminat stradal defect pe str.',
  },
  vandalism: {
    label: 'Vandalism',
    icon: '🔨',
    color: '#E64A19',
    authorityName: 'Poliția Rezina',
    defaultTitle: 'Act de vandalism la',
  },
  stray_animals: {
    label: 'Animale vagabonde',
    icon: '🐕',
    color: '#F57F17',
    authorityName: 'Primăria Rezina',
    defaultTitle: 'Animale vagabonde pe str.',
  },
  [ReportCategory.other]: {
    label: 'Altele',
    icon: '❓',
    color: '#AB47BC',
    authorityName: 'Primăria Rezina',
    defaultTitle: 'Sesizare privind',
  },
};

// Generate a random fingerprint for voting
const getFingerprint = () => {
  let fp = localStorage.getItem('voter_fingerprint');
  if (!fp) {
    fp = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('voter_fingerprint', fp);
  }
  return fp;
};

// --- Custom Leaflet Icons ---
const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: '<div class="user-location-pulse"></div><div class="user-location-dot"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const createReportIcon = (category: string, isResolved: boolean) => {
  const cfg = CATEGORY_CONFIG[category];
  const color = cfg?.color || '#AB47BC';
  return L.divIcon({
    className: 'custom-report-marker',
    html: `<div style="
      background-color:${color};
      width:24px;height:24px;border-radius:50%;
      border:2px solid white;
      box-shadow:0 2px 4px rgba(0,0,0,0.3);
      opacity:${isResolved ? 0.45 : 1};
      display:flex;align-items:center;justify-content:center;
    "><div style="width:8px;height:8px;background:white;border-radius:50%;"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const reportMarkersRef = useRef<L.LayerGroup | null>(null);

  const [userLoc, setUserLoc] = useState<L.LatLng | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports } = useListReports();
  const createReportMutation = useCreateReport();
  const voteResolvedMutation = useVoteResolved();

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const container = L.DomUtil.get(mapRef.current);
    if (container != null && (container as any)._leaflet_id) {
      (container as any)._leaflet_id = null;
    }

    leafletMap.current = L.map(mapRef.current, {
      center: REZINA_COORDS,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(leafletMap.current);

    reportMarkersRef.current = L.layerGroup().addTo(leafletMap.current);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        setUserLoc(latlng);
        setIsLocating(false);
        if (leafletMap.current) {
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker(latlng, { icon: userLocationIcon }).addTo(leafletMap.current);
            leafletMap.current.setView(latlng, 16);
          } else {
            userMarkerRef.current.setLatLng(latlng);
          }
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast({ description: 'Permisiune GPS respinsă. Folosim locația generală.' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Sync Reports to Map
  useEffect(() => {
    if (!leafletMap.current || !reportMarkersRef.current || !reports) return;
    reportMarkersRef.current.clearLayers();
    reports.forEach((report) => {
      const marker = L.marker([report.latitude, report.longitude], {
        icon: createReportIcon(report.category, report.status === 'resolved'),
      });
      marker.on('click', () => setSelectedReport(report));
      if (reportMarkersRef.current) marker.addTo(reportMarkersRef.current);
    });
  }, [reports]);

  // Form State
  const [formCategory, setFormCategory] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhoto, setFormPhoto] = useState<string | null>(null);
  const [formAddress, setFormAddress] = useState<string>('');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);

  // Reverse geocode GPS coords → street address using Nominatim
  useEffect(() => {
    if (!userLoc) return;
    let cancelled = false;
    setIsGeocodingAddress(true);
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${userLoc.lat}&lon=${userLoc.lng}&format=json&accept-language=ro`,
      { headers: { 'Accept-Language': 'ro' } }
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const addr = data?.address ?? {};
        // Build a short human-readable street string
        const parts: string[] = [];
        if (addr.road) parts.push(addr.road);
        if (addr.house_number) parts.push(addr.house_number);
        if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
        const street = parts.join(', ');
        setFormAddress(street || data?.display_name?.split(',')[0] || '');
      })
      .catch(() => { /* silent — GPS coords still sent */ })
      .finally(() => { if (!cancelled) setIsGeocodingAddress(false); });
    return () => { cancelled = true; };
  }, [userLoc]);

  // Auto-fill title when category is selected (appends street if known)
  const handleCategorySelect = useCallback((cat: string) => {
    setFormCategory(cat);
    const base = CATEGORY_CONFIG[cat]?.defaultTitle || '';
    const withStreet = formAddress ? `${base} ${formAddress}` : base;
    const currentIsDefault = Object.values(CATEGORY_CONFIG).some(c =>
      formTitle === c.defaultTitle || formTitle === `${c.defaultTitle} ${formAddress}`
    );
    if (!formTitle || currentIsDefault) {
      setFormTitle(withStreet);
    }
  }, [formTitle, formAddress]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormCategory(null);
    setFormTitle('');
    setFormDesc('');
    setFormPhoto(null);
    setFormName('');
    setFormEmail('');
    // Keep formAddress — it's tied to GPS location, not the form submission
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory) {
      toast({ description: 'Selectați categoria sesizării.', variant: 'destructive' });
      return;
    }
    if (!formTitle || formTitle.length < 3) {
      toast({ description: 'Titlul este prea scurt (min. 3 caractere).', variant: 'destructive' });
      return;
    }
    if (!formDesc || formDesc.length < 10) {
      toast({ description: 'Descrierea este prea scurtă (min. 10 caractere).', variant: 'destructive' });
      return;
    }

    const lat = userLoc?.lat ?? REZINA_COORDS[0];
    const lng = userLoc?.lng ?? REZINA_COORDS[1];

    createReportMutation.mutate(
      {
        data: {
          title: formTitle,
          description: formDesc,
          category: formCategory as ReportInputCategory,
          latitude: lat,
          longitude: lng,
          photoBase64: formPhoto,
          reporterName: formName || undefined,
          reporterEmail: formEmail || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsDrawerOpen(false);
          resetForm();
          toast({ title: 'Sesizare trimisă!', description: 'Autoritatea competentă a fost notificată.' });
          queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
        },
        onError: () => {
          toast({ title: 'Eroare', description: 'Nu s-a putut trimite sesizarea.', variant: 'destructive' });
        },
      }
    );
  };

  const handleVoteResolved = (id: number) => {
    voteResolvedMutation.mutate(
      { id, data: { voterFingerprint: getFingerprint() } },
      {
        onSuccess: (updatedReport) => {
          setSelectedReport(updatedReport);
          queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
          toast({ description: 'Vot înregistrat!' });
        },
        onError: () => {
          toast({ description: 'Eroare la vot. Poate ați votat deja.', variant: 'destructive' });
        },
      }
    );
  };

  const selectedCatCfg = formCategory ? CATEGORY_CONFIG[formCategory] : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">

      {/* Map */}
      <div ref={mapRef} className="w-full h-full z-0" />

      {/* Top branding pill */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
        <div className="bg-background/80 backdrop-blur-md border border-border px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-primary uppercase">Rezina Smart City</span>
          <span className="text-border">·</span>
          <span className="text-xs text-muted-foreground">Raportare urbană</span>
        </div>
      </div>

      {/* FAB — report problem */}
      <div className="fixed bottom-6 right-5 z-[9999] flex flex-col items-end gap-2">
        {isLocating && (
          <div className="bg-background/80 text-foreground px-3 py-1 rounded-full text-xs flex items-center gap-2 backdrop-blur-sm shadow-md border border-border">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>GPS…</span>
          </div>
        )}
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="w-[60px] h-[60px] bg-[#E53935] hover:bg-[#C62828] rounded-full flex items-center justify-center text-white shadow-[0_4px_20px_rgba(229,57,53,0.6)] transition-transform hover:scale-105 active:scale-95"
          aria-label="Raportează o problemă"
        >
          <Camera className="w-7 h-7" />
        </button>
      </div>

      {/* Footer attribution */}
      <div className="fixed bottom-2 left-3 z-[9990] pointer-events-none">
        <span className="text-[10px] text-muted-foreground/60">© Pavel Dordea</span>
      </div>

      {/* ─── Report Form Drawer ─── */}
      <Drawer open={isDrawerOpen} onOpenChange={(o) => { setIsDrawerOpen(o); if (!o) resetForm(); }}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle className="text-lg">Raportează o problemă</DrawerTitle>
            <DrawerDescription>
              Sesizarea va fi trimisă automat autorității competente.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-2 overflow-y-auto max-h-[calc(92vh-160px)] custom-scrollbar">
            <form id="report-form" onSubmit={handleReportSubmit} className="space-y-5">

              {/* Category Picker */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Categoria <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2.5 border rounded-xl transition-all text-center gap-0.5',
                        formCategory === cat
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-accent/10'
                      )}
                    >
                      <span className="text-xl leading-none">{cfg.icon}</span>
                      <span className="text-[10px] leading-tight mt-1 line-clamp-2">{cfg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Authority info — shown when category selected */}
              {selectedCatCfg && (
                <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Sesizarea va fi trimisă la:{' '}
                    <span className="font-semibold text-foreground">{selectedCatCfg.authorityName}</span>
                  </span>
                </div>
              )}

              {/* Title — auto-filled */}
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Titlu <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1 text-xs">(completat automat, puteți redacta)</span>
                </Label>
                <Input
                  id="title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ex. Groapă periculoasă pe str. M. Eminescu"
                  required
                  minLength={3}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descriere detaliată <span className="text-destructive">*</span></Label>
                <Textarea
                  id="desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Descrieți problema cât mai detaliat: locul exact, gravitatea, pericolul pentru cetățeni…"
                  required
                  minLength={10}
                  rows={3}
                />
              </div>

              {/* Photo */}
              <div className="space-y-1.5">
                <Label>Fotografie <span className="text-muted-foreground font-normal text-xs">(opțional)</span></Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center w-20 h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-accent/10 transition-colors flex-shrink-0">
                    {formPhoto ? (
                      <img src={formPhoto} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <Plus className="w-7 h-7 text-muted-foreground" />
                    )}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                  {formPhoto && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFormPhoto(null)} className="text-xs">
                      Șterge poza
                    </Button>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <Label>Locație GPS</Label>
                <div className={cn(
                  'flex items-start gap-2 text-xs p-2.5 rounded-lg border',
                  userLoc
                    ? 'text-green-400 bg-green-500/10 border-green-500/20'
                    : 'text-muted-foreground bg-muted/30 border-border'
                )}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {userLoc ? (
                      <>
                        <div>GPS detectat ✓</div>
                        {isGeocodingAddress && (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Se identifică strada…
                          </div>
                        )}
                        {formAddress && !isGeocodingAddress && (
                          <div className="text-foreground font-medium">{formAddress}</div>
                        )}
                        <div className="text-muted-foreground">{userLoc.lat.toFixed(5)}, {userLoc.lng.toFixed(5)}</div>
                      </>
                    ) : (
                      <div>GPS nedetectat — se va folosi centrul orașului</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact (optional) */}
              <div className="pt-3 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date de contact — opțional</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">Nume</Label>
                    <Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ion Popescu" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs">Email</Label>
                    <Input id="email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="ion@exemplu.md" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Sesizarea va fi transmisă conform Legii RM nr.&nbsp;190/1994 cu privire la petiționare.
                </p>
              </div>

            </form>
          </div>

          <DrawerFooter className="pt-2 gap-2">
            <Button
              type="submit"
              form="report-form"
              className="w-full text-base font-semibold py-5 bg-[#E53935] hover:bg-[#C62828] text-white"
              disabled={createReportMutation.isPending}
            >
              {createReportMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Trimite Sesizarea
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">Anulează</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ─── Report Detail Drawer ─── */}
      <Drawer open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DrawerContent className="max-h-[85vh]">
          {selectedReport && (() => {
            const cfg = CATEGORY_CONFIG[selectedReport.category];
            return (
              <>
                <DrawerHeader className="text-left pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{cfg?.icon ?? '📋'}</span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {cfg?.label ?? selectedReport.category}
                    </span>
                    {selectedReport.status === 'resolved' && (
                      <span className="ml-auto bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full font-medium">Remediat</span>
                    )}
                  </div>
                  <DrawerTitle className="text-lg leading-tight">{selectedReport.title}</DrawerTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(selectedReport.createdAt).toLocaleDateString('ro-MD', { day: '2-digit', month: 'long', year: 'numeric' })}
                    {cfg && (
                      <span className="ml-2 text-primary/80">→ {cfg.authorityName}</span>
                    )}
                  </div>
                </DrawerHeader>

                <div className="px-4 pb-2 overflow-y-auto">
                  <div className="bg-accent/5 rounded-xl p-4 mb-4 text-sm leading-relaxed border border-border">
                    {selectedReport.description}
                  </div>

                  {selectedReport.photoBase64 && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-border bg-black/20">
                      <img src={selectedReport.photoBase64} alt="Poză" className="w-full h-auto max-h-56 object-contain" />
                    </div>
                  )}

                  <div className="bg-card border rounded-xl p-4 flex flex-col items-center text-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="font-medium">{selectedReport.resolvedVotes}/3 persoane confirmă remedierea</span>
                    </div>

                    {selectedReport.status !== 'resolved' && (
                      <Button
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={() => handleVoteResolved(selectedReport.id)}
                        disabled={voteResolvedMutation.isPending}
                      >
                        {voteResolvedMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Confirmă remedierea ✓
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
