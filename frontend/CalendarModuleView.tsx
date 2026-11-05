// ============================================================================
// KUMA Module: Official School Calendar — frontend view (self-contained).
//
// No host imports: own i18n dict (FR-first), own service, own data bundle.
// Works embedded (host router) or standalone (any React 18+ app, any CSS stack
// with Tailwind). Pure Tailwind utilities only — no host CSS classes.
//
// Props let each host adapt without forking:
//   lang      'fr' (default) | 'en'
//   apiBase   module API base (default '/api/v1/modules/calendar')
//   getToken  auth token provider (default localStorage 'kuma_token')
//   userRole  role string; Import tab shows for school leadership only
//             (falls back to localStorage 'kuma_user'.role)
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Coffee, FileUp, GraduationCap, PartyPopper, Sun, XCircle, CheckCircle2 } from 'lucide-react';
import { CalendarService } from './calendar.service';
import type { CalendarYearSummary, CalendarYearDetail, TodayPayload } from './calendar.service';
import { OFFICIAL_CALENDAR_CI_2026_2027 } from './data';

type Lang = 'fr' | 'en';

export interface CalendarModuleViewProps {
    lang?: Lang;
    apiBase?: string;
    getToken?: () => string | null;
    userRole?: string;
    embedded?: boolean;
}

const LEADERSHIP_ROLES = new Set(['admin', 'director', 'directeur', 'directrice', 'founder', 'fondatrice', 'manager', 'gestionnaire']);

const DICT = {
    fr: {
        title: 'Calendrier scolaire officiel',
        subtitle: 'Trimestres, congés, évaluations et jours fériés',
        tabToday: "Aujourd'hui", tabYear: 'Vue annuelle', tabTerms: 'Trimestres', tabEval: 'Évaluations', tabHolidays: 'Jours fériés', tabImport: 'Importer',
        loading: 'Chargement…',
        notConfigured: 'Aucun calendrier officiel importé pour cette école.',
        todayIsSchoolDay: 'Jour de classe',
        todayNotSchoolDay: 'Pas de classe',
        reasonSchool: 'Journée de cours', reasonWeekend: 'Week-end', reasonHoliday: 'Jour férié',
        reasonBreak: 'Congés', reasonBetween: 'Entre deux trimestres',
        nextEvents: 'Prochains jalons',
        daysUntil: (n: number) => (n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`),
        term: 'Trimestre', termStart: 'Début des cours', termEnd: 'Fin du trimestre',
        breakStart: 'Début des congés', evaluation: 'Évaluation', holiday: 'Férié',
        breakNoun: 'Congé', eventsNoun: 'événements', yearBadge: 'Calendrier officiel intégré',
        trackCp1Cm1: 'CP1 → CM1', trackCm2: 'CM2 (CEPE)',
        kindComposition: 'Composition', kindExamenBlanc: 'Examen blanc', kindNational: 'Épreuve nationale',
        kindFixe: 'Fixe', kindVariable: 'Variable (religieux)',
        importTitle: 'Importer un calendrier officiel',
        importBundled: 'Calendrier officiel 2026-2027 (Côte d\'Ivoire)',
        importBundledDesc: '3 trimestres · 5 congés · 9 évaluations · 14 jours fériés',
        importFromFile: '…ou charger un fichier JSON',
        importing: 'Import en cours…',
        importSuccess: (label: string, replaced: boolean) => replaced ? `Calendrier ${label} mis à jour` : `Calendrier ${label} importé`,
        importForbidden: 'Seuls les responsables de l\'école peuvent importer un calendrier.',
        years: 'Années importées',
        refreshed: 'Calendrier à jour',
    },
    en: {
        title: 'Official school calendar',
        subtitle: 'Terms, breaks, evaluations and public holidays',
        tabToday: 'Today', tabYear: 'Year view', tabTerms: 'Terms', tabEval: 'Evaluations', tabHolidays: 'Public holidays', tabImport: 'Import',
        loading: 'Loading…',
        notConfigured: 'No official calendar imported for this school yet.',
        todayIsSchoolDay: 'School day',
        todayNotSchoolDay: 'No school',
        reasonSchool: 'Class day', reasonWeekend: 'Weekend', reasonHoliday: 'Public holiday',
        reasonBreak: 'School break', reasonBetween: 'Between terms',
        nextEvents: 'Next milestones',
        daysUntil: (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`),
        term: 'Term', termStart: 'Term starts', termEnd: 'Term ends',
        breakStart: 'Break starts', evaluation: 'Evaluation', holiday: 'Holiday',
        breakNoun: 'Break', eventsNoun: 'events', yearBadge: 'Official calendar integrated',
        trackCp1Cm1: 'CP1 → CM1', trackCm2: 'CM2 (CEPE)',
        kindComposition: 'Composition', kindExamenBlanc: 'Mock exam', kindNational: 'National exam',
        kindFixe: 'Fixed', kindVariable: 'Variable (religious)',
        importTitle: 'Import an official calendar',
        importBundled: 'Official 2026-2027 calendar (Côte d\'Ivoire)',
        importBundledDesc: '3 terms · 5 breaks · 9 evaluations · 14 public holidays',
        importFromFile: '…or load a JSON file',
        importing: 'Importing…',
        importSuccess: (label: string, replaced: boolean) => replaced ? `Calendar ${label} updated` : `Calendar ${label} imported`,
        importForbidden: 'Only school leadership can import a calendar.',
        years: 'Imported years',
        refreshed: 'Calendar up to date',
    },
} as const;

const kindLabel = (t: ReturnType<typeof getDict>, kind: string) =>
    kind === 'examen_blanc' ? t.kindExamenBlanc : kind === 'national' ? t.kindNational : t.kindComposition;

function getDict(lang: Lang) { return DICT[lang]; }

// ---- Year calendar grid (same look as the host academic calendar view) ----
// Self-contained on purpose: no host imports, pure Tailwind, own i18n.
const YEAR_DAY_BG: Record<string, string> = {
    holiday: 'bg-red-200/70 text-red-900 font-semibold',
    exam: 'bg-purple-200/70 text-purple-900 font-semibold',
    break: 'bg-amber-200/70 text-amber-900',
    event: 'bg-slate-200/70 text-slate-700',
};
const YEAR_DOT: Record<string, string> = { holiday: 'bg-red-400', exam: 'bg-purple-400', break: 'bg-amber-400', event: 'bg-slate-400' };
const YEAR_PRIORITY: Record<string, number> = { exam: 4, holiday: 3, break: 2, event: 0 };

interface YearItem { id: string; title: string; type: 'term' | 'break' | 'exam' | 'holiday'; start: string; end: string; sub?: string }
const yIso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yFromISO = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};

export default function CalendarModuleView({ lang = 'fr', apiBase, getToken, userRole, embedded = false }: CalendarModuleViewProps) {
    const t = useMemo(() => getDict(lang), [lang]);
    const svc = useMemo(() => new CalendarService({ apiBase, getToken }), [apiBase, getToken]);

    const [tab, setTab] = useState<'today' | 'year' | 'terms' | 'eval' | 'holidays' | 'import'>('today');
    const [today, setToday] = useState<TodayPayload | null>(null);
    const [years, setYears] = useState<CalendarYearSummary[]>([]);
    const [detail, setDetail] = useState<CalendarYearDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    // Hover experience on the year grid (rich day tooltip).
    const [yearHover, setYearHover] = useState<{ monthKey: string; iso: string; items: YearItem[]; x: number; y: number; below: boolean } | null>(null);

    const effectiveRole = useMemo(() => {
        if (userRole) return userRole.toLowerCase();
        try {
            const u = JSON.parse(localStorage.getItem('kuma_user') || '{}');
            return String(u.role || '').toLowerCase();
        } catch { return ''; }
    }, [userRole]);
    const canImport = LEADERSHIP_ROLES.has(effectiveRole);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [tp, ys] = await Promise.all([svc.today().catch(() => null), svc.listYears().catch(() => ({ years: [] }))]);
            setToday(tp);
            setYears(ys.years || []);
            const latest = (ys.years || [])[0];
            setDetail(latest ? await svc.getYear(latest.label).catch(() => null) : null);
        } finally {
            setLoading(false);
        }
    }, [svc]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const doImport = async (payload: unknown) => {
        setImporting(true); setMessage(null);
        try {
            const res = await svc.importCalendar(payload);
            setMessage({ ok: true, text: t.importSuccess(res.imported.label, res.replaced) });
            await loadAll();
            setTab('today');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Import failed';
            setMessage({ ok: false, text: msg === 'Forbidden' ? t.importForbidden : msg });
        } finally {
            setImporting(false);
        }
    };

    const onFile = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { doImport(JSON.parse(String(reader.result))); }
            catch { setMessage({ ok: false, text: 'Invalid JSON file' }); }
        };
        reader.readAsText(file);
    };

    const status = today?.status;
    const statusPill = !today?.configured ? null
        : status?.isSchoolDay ? { icon: <CheckCircle2 size={16} />, cls: 'bg-emerald-50 text-emerald-700', text: t.todayIsSchoolDay }
        : { icon: <XCircle size={16} />, cls: 'bg-amber-50 text-amber-700', text: `${t.todayNotSchoolDay} — ${status?.reason || ''}` };

    const tabCls = (active: boolean) =>
        `px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

    // ---- Year calendar grid: the whole official year at a glance, with smooth hover cards ----
    const renderYearGrid = () => {
        if (!detail) return null;
        const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
        const weekdays = lang === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
        const typeLabel = (ty: YearItem['type']) =>
            ty === 'term' ? t.term : ty === 'break' ? t.breakNoun : ty === 'exam' ? t.evaluation : t.holiday;

        const items: YearItem[] = [
            ...detail.terms.map((tm, i) => ({ id: `t${i}`, title: tm.label, type: 'term' as const, start: tm.start_date, end: tm.end_date })),
            ...detail.breaks.map((b, i) => ({ id: `b${i}`, title: b.label, type: 'break' as const, start: b.start_date, end: b.end_date })),
            ...detail.evaluations.map((e, i) => ({ id: `e${i}`, title: e.label, type: 'exam' as const, start: e.date, end: e.date, sub: e.track === 'cm2' ? t.trackCm2 : t.trackCp1Cm1 })),
            ...detail.holidays.map((h, i) => ({ id: `h${i}`, title: h.label, type: 'holiday' as const, start: h.date, end: h.date, sub: h.kind === 'variable' ? t.kindVariable : t.kindFixe })),
        ];
        const starts = items.map((it) => it.start).sort();
        const ends = items.map((it) => it.end).sort();
        const months: { y: number; m: number }[] = [];
        if (starts.length && ends.length) {
            let [cy, cm] = starts[0].split('-').map(Number);
            const [ly, lm] = ends[ends.length - 1].split('-').map(Number);
            let guard = 0;
            while ((cy < ly || (cy === ly && cm <= lm)) && guard < 18) {
                months.push({ y: cy, m: cm - 1 });
                guard++; cm++;
                if (cm > 12) { cm = 1; cy++; }
            }
        }
        const todayIso = yIso(new Date());
        const fmtShort = (s: string) => yFromISO(s).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{detail.year.label}</span>
                    <span className="text-[11px] text-slate-400">{items.length} {t.eventsNoun}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        <CheckCircle2 size={12} /> {t.yearBadge}
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {months.map((mo) => {
                        const monthKey = `${mo.y}-${mo.m}`;
                        const firstDow = (new Date(mo.y, mo.m, 1).getDay() + 6) % 7;
                        const dim = new Date(mo.y, mo.m + 1, 0).getDate();
                        const monthStart = `${mo.y}-${String(mo.m + 1).padStart(2, '0')}-01`;
                        const monthEnd = `${mo.y}-${String(mo.m + 1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
                        const marks = new Map<string, string>();
                        const dayItems = new Map<string, YearItem[]>();
                        for (const it of items) {
                            if (it.type === 'term') continue; // terms render as range lines
                            let [cy, cm, cd] = it.start.split('-').map(Number);
                            const [ey, em, ed] = it.end.split('-').map(Number);
                            const cur = new Date(cy, cm - 1, cd);
                            const last = new Date(ey, em - 1, ed);
                            let guard = 0;
                            while (cur <= last && guard < 62) {
                                const iso = yIso(cur);
                                const prev = marks.get(iso);
                                if (!prev || (YEAR_PRIORITY[it.type] || 0) > (YEAR_PRIORITY[prev] || 0)) marks.set(iso, it.type);
                                const arr = dayItems.get(iso) || [];
                                arr.push(it);
                                dayItems.set(iso, arr);
                                cur.setDate(cur.getDate() + 1);
                                guard++;
                            }
                        }
                        const cells: (number | null)[] = [];
                        for (let i = 0; i < firstDow; i++) cells.push(null);
                        for (let d = 1; d <= dim; d++) cells.push(d);
                        const monthTerms = items.filter((it) => it.type === 'term' && it.start <= monthEnd && it.end >= monthStart);
                        const monthName = new Date(mo.y, mo.m, 1).toLocaleDateString(locale, { month: 'long' });
                        const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                        const showTip = yearHover && yearHover.monthKey === monthKey && yearHover.iso;
                        const tipDate = showTip ? yFromISO(yearHover!.iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                        return (
                            <div key={monthKey} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                <p className="mb-1.5 text-xs font-semibold text-slate-700">{monthNameCap}</p>
                                <div className="mb-0.5 grid grid-cols-7 gap-[2px]">
                                    {weekdays.map((wd, i) => <div key={`${wd}-${i}`} className="truncate text-center text-[10px] text-slate-400">{wd}</div>)}
                                </div>
                                <div
                                    className="relative grid grid-cols-7 gap-[2px]"
                                    onMouseLeave={() => setYearHover((h) => (h && h.monthKey === monthKey ? { ...h, iso: null } : h))}
                                >
                                    {cells.map((d, i) => {
                                        const iso = d ? `${mo.y}-${String(mo.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
                                        const ty = d ? marks.get(iso) : undefined;
                                        const isToday = !!d && iso === todayIso;
                                        const hasEvents = !!d && dayItems.has(iso);
                                        return (
                                            <div
                                                key={i}
                                                onMouseEnter={hasEvents ? (e) => {
                                                    const cell = e.currentTarget as HTMLElement;
                                                    const grid = cell.offsetParent as HTMLElement | null;
                                                    const gw = grid ? grid.clientWidth : 240;
                                                    const below = cell.offsetTop < 60;
                                                    setYearHover({
                                                        monthKey,
                                                        iso,
                                                        items: dayItems.get(iso) || [],
                                                        x: Math.max(4, Math.min(cell.offsetLeft, gw - 232)),
                                                        y: below ? cell.offsetTop + cell.offsetHeight + 6 : cell.offsetTop - 6,
                                                        below,
                                                    });
                                                } : undefined}
                                                className={`flex h-6 items-center justify-center rounded-sm text-[10px] leading-none transition-all duration-100 ${d ? (ty ? `${YEAR_DAY_BG[ty]} cursor-help hover:brightness-95` : 'text-slate-500 hover:bg-slate-50') : ''} ${isToday ? 'ring-1 ring-orange-500' : ''}`}
                                            >
                                                {d || ''}
                                            </div>
                                        );
                                    })}
                                    <div
                                        aria-hidden="true"
                                        className={`pointer-events-none absolute z-30 w-56 rounded-lg bg-slate-900/95 p-2.5 text-left shadow-xl ring-1 ring-black/20 transition-all duration-150 ${showTip ? 'visible opacity-100' : 'invisible opacity-0'}`}
                                        style={{ left: showTip ? yearHover!.x : 0, top: showTip ? yearHover!.y : 0, transform: showTip && !yearHover!.below ? 'translateY(-100%)' : 'none' }}
                                    >
                                        {showTip && (
                                            <>
                                                <p className="text-[11px] font-semibold capitalize text-white">{tipDate}</p>
                                                <div className="mt-1.5 space-y-1.5">
                                                    {yearHover!.items.map((it) => (
                                                        <div key={it.id} className="flex items-start gap-1.5">
                                                            <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${YEAR_DOT[it.type] || 'bg-slate-400'}`} />
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] font-medium leading-tight text-white">{it.title}</p>
                                                                <p className="text-[10px] leading-tight text-slate-300">
                                                                    {it.sub ? `${typeLabel(it.type)} · ${it.sub}` : typeLabel(it.type)}{it.start !== it.end ? ` · ${fmtShort(it.start)} → ${fmtShort(it.end)}` : ''}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {monthTerms.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                        {monthTerms.map((r) => (
                                            <div key={r.id} className="flex items-center gap-1 text-[10px] text-slate-500" title={`${r.title}: ${r.start} → ${r.end}`}>
                                                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />
                                                <span className="truncate">{r.title} · {fmtShort(r.start)}{r.end !== r.start ? ` → ${fmtShort(r.end)}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-5 text-slate-800">
            {!embedded && (
                <div className="flex items-center gap-3">
                    <CalendarDays className="text-indigo-600" size={22} />
                    <div>
                        <h2 className="text-xl font-bold leading-tight">{t.title}</h2>
                        <p className="text-xs text-slate-500">{t.subtitle}</p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button className={tabCls(tab === 'today')} onClick={() => setTab('today')}>{t.tabToday}</button>
                <button className={tabCls(tab === 'year')} onClick={() => setTab('year')}>{t.tabYear}</button>
                <button className={tabCls(tab === 'terms')} onClick={() => setTab('terms')}>{t.tabTerms}</button>
                <button className={tabCls(tab === 'eval')} onClick={() => setTab('eval')}>{t.tabEval}</button>
                <button className={tabCls(tab === 'holidays')} onClick={() => setTab('holidays')}>{t.tabHolidays}</button>
                {canImport && <button className={tabCls(tab === 'import')} onClick={() => setTab('import')}>{t.tabImport}</button>}
            </div>

            {loading ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400">{t.loading}</div>
            ) : tab === 'today' ? (
                <div className="space-y-4">
                    {!today?.configured ? (
                        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
                            {t.notConfigured}
                            {canImport && (
                                <div className="mt-3">
                                    <button onClick={() => setTab('import')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                                        <FileUp size={15} /> {t.tabImport}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-slate-100 bg-white p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{today.date}</p>
                                        <p className="mt-1 text-sm font-semibold">{today.year?.label} · {today.year?.country}</p>
                                    </div>
                                    {statusPill && (
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusPill.cls}`}>
                                            {statusPill.icon} {statusPill.text}
                                        </span>
                                    )}
                                </div>
                                {status?.term && (
                                    <p className="mt-2 text-xs text-slate-500">{t.term} {status.term.termNumber} — {status.term.label}</p>
                                )}
                            </div>
                            {(today.nextEvents || []).length > 0 && (
                                <div className="rounded-2xl border border-slate-100 bg-white p-5">
                                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t.nextEvents}</h4>
                                    <div className="space-y-2">
                                        {(today.nextEvents || []).map((ev) => (
                                            <div key={`${ev.kind}-${ev.date}-${ev.label}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-sm">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {ev.kind === 'evaluation' ? <GraduationCap size={15} className="shrink-0 text-indigo-500" />
                                                        : ev.kind === 'holiday' ? <PartyPopper size={15} className="shrink-0 text-rose-500" />
                                                        : ev.kind === 'break-start' ? <Coffee size={15} className="shrink-0 text-amber-500" />
                                                        : <CalendarDays size={15} className="shrink-0 text-slate-400" />}
                                                    <span className="truncate font-medium text-slate-700">{ev.label}</span>
                                                </div>
                                                <span className="ml-2 whitespace-nowrap text-xs text-slate-500">{ev.date} · {t.daysUntil(ev.daysUntil)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : !detail ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">{t.notConfigured}</div>
            ) : tab === 'year' ? (
                renderYearGrid()
            ) : tab === 'terms' ? (
                <div className="space-y-3">
                    {detail.terms.map((term) => (
                        <div key={term.label} className="rounded-2xl border border-slate-100 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold">{term.label}</p>
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                    {t.term} {term.term_number}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{term.start_date} → {term.end_date}</p>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                                <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: '100%' }} />
                            </div>
                            {detail.breaks.filter((b) => b.start_date >= term.start_date && b.start_date <= term.end_date).map((b) => (
                                <p key={b.label} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                                    <Coffee size={10} /> {b.label} · {b.start_date} → {b.end_date}
                                </p>
                            ))}
                        </div>
                    ))}
                </div>
            ) : tab === 'eval' ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {(['cp1-cm1', 'cm2'] as const).map((track) => (
                        <div key={track} className="rounded-2xl border border-slate-100 bg-white p-4">
                            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold">
                                <GraduationCap size={16} className="text-indigo-500" />
                                {track === 'cm2' ? t.trackCm2 : t.trackCp1Cm1}
                            </h4>
                            <div className="space-y-2">
                                {detail.evaluations.filter((e) => e.track === track).map((e) => (
                                    <div key={`${e.label}-${e.date}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-sm">
                                        <span className="truncate font-medium text-slate-700">{e.label}</span>
                                        <span className="ml-2 whitespace-nowrap text-xs text-slate-500">
                                            {kindLabel(t, e.kind)} · {e.date}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : tab === 'holidays' ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="space-y-2">
                        {detail.holidays.map((h) => (
                            <div key={`${h.label}-${h.date}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-sm">
                                <div className="flex min-w-0 items-center gap-2">
                                    <PartyPopper size={15} className="shrink-0 text-rose-500" />
                                    <span className="truncate font-medium text-slate-700">{h.label}</span>
                                </div>
                                <span className="ml-2 whitespace-nowrap text-xs text-slate-500">{h.date} · {h.kind === 'variable' ? t.kindVariable : t.kindFixe}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5">
                        <h4 className="text-sm font-bold">{t.importTitle}</h4>
                        {message && (
                            <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                {message.text}
                            </p>
                        )}
                        <button
                            disabled={importing}
                            onClick={() => doImport(OFFICIAL_CALENDAR_CI_2026_2027)}
                            className="mt-3 w-full rounded-xl bg-indigo-600 p-3 text-left text-white hover:opacity-90 disabled:opacity-50"
                        >
                            <span className="flex items-center gap-2 text-sm font-bold">
                                <Sun size={16} /> {importing ? t.importing : t.importBundled}
                            </span>
                            <span className="mt-0.5 block text-xs opacity-80">{t.importBundledDesc}</span>
                        </button>
                        <label className="mt-3 block cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
                            {t.importFromFile}
                            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
                        </label>
                    </div>
                    {years.length > 0 && (
                        <div className="rounded-2xl border border-slate-100 bg-white p-5">
                            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t.years}</h4>
                            <div className="space-y-2">
                                {years.map((y) => (
                                    <div key={y.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-sm">
                                        <span className="font-semibold">{y.label}</span>
                                        <span className="text-xs text-slate-500">
                                            {y.terms_count} {t.tabTerms.toLowerCase()} · {y.evaluations_count} {t.tabEval.toLowerCase()} · {y.holidays_count} {t.tabHolidays.toLowerCase()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
