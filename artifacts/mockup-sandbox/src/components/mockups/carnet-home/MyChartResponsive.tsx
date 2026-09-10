import { useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  Home,
  Menu,
  MessageCircle,
  Package,
  Pill,
  Search,
  ShieldCheck,
  Stethoscope,
  Thermometer,
  UserRound,
  UsersRound,
  Video,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./_group.css";

type Action = { label: string; icon: LucideIcon; tint: string; note?: string };

const actions: Action[] = [
  { label: "Telehealth", icon: Video, tint: "bg-[#e7f4ff] text-[#0872bb]", note: "Talk to your care team" },
  { label: "Schedule visit", icon: CalendarDays, tint: "bg-[#fff0eb] text-[#cc5e44]", note: "Find the right time" },
  { label: "Messages", icon: MessageCircle, tint: "bg-[#eef1ff] text-[#5668b3]", note: "3 new messages" },
  { label: "Test results", icon: BarChart3, tint: "bg-[#e8f7f3] text-[#167b68]", note: "1 new result" },
  { label: "Medications", icon: Pill, tint: "bg-[#fff6dc] text-[#a66a00]" },
  { label: "Billing", icon: CreditCard, tint: "bg-[#f8ecf0] text-[#a84866]" },
  { label: "Documents", icon: FileText, tint: "bg-[#eff2f4] text-[#5d6f7d]" },
  { label: "Family", icon: UsersRound, tint: "bg-[#f1ecff] text-[#7355aa]" },
  { label: "Emergency card", icon: AlertCircle, tint: "bg-[#fff0ed] text-[#c44c3c]" },
  { label: "Health timeline", icon: Clock3, tint: "bg-[#eaf4ff] text-[#2c73ae]" },
  { label: "Symptom checker", icon: Thermometer, tint: "bg-[#fceef4] text-[#b4466d]" },
  { label: "Interactions", icon: Zap, tint: "bg-[#fff6dc] text-[#a66a00]" },
  { label: "Export records", icon: Download, tint: "bg-[#ebf3f6] text-[#35738b]" },
  { label: "Health metrics", icon: Activity, tint: "bg-[#e8f7f3] text-[#167b68]" },
];

function BrandMark() {
  return <div className="flex items-center gap-2.5 text-[#12375a]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b6fb8] text-white shadow-[0_5px_12px_rgba(11,111,184,.23)]"><HeartPulse size={21} strokeWidth={2.5} /></span><span className="font-['Bricolage_Grotesque',sans-serif] text-[20px] font-bold tracking-[-.06em]">CARNET</span><span className="hidden border-l border-[#c9d9e5] pl-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#6f8496] sm:inline">by Argilette</span></div>;
}

function ActionTile({ action, onClick }: { action: Action; onClick: () => void }) {
  const Icon = action.icon;
  return <button onClick={onClick} className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-[#dce6ec] bg-[#fffefd] p-3 text-left shadow-[0_2px_0_rgba(22,62,86,.03)] transition duration-200 hover:-translate-y-0.5 hover:border-[#9dc9e4] hover:shadow-[0_9px_20px_rgba(18,74,110,.1)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ef6e5a] active:scale-[.98] sm:min-h-[136px] sm:p-4" type="button">
    <span className={`grid h-10 w-10 place-items-center rounded-xl ${action.tint}`}><Icon size={21} strokeWidth={2.2} /></span>
    <span><span className="block text-[13px] font-bold leading-[1.1] text-[#16344e] sm:text-[14px]">{action.label}</span>{action.note && <span className="mt-1 hidden text-[11px] leading-tight text-[#698093] md:block">{action.note}</span>}</span>
  </button>;
}

export function MyChartResponsive() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("You have 3 new messages from your care team.");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const doAction = (label: string) => setNotice(`${label} is ready when you are.`);

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#f3f7f7] font-['DM_Sans',sans-serif] text-[#17354d]">
      <div className="h-1 bg-[#ed6e5c]" />
      <header className="border-b border-[#dce7ec] bg-[#fffefd]">
        <div className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <nav className="hidden items-center gap-1 text-[14px] font-bold text-[#36546b] md:flex">
            {["Home", "Appointments", "Messages", "Health record", "Billing"].map((item) => <button key={item} onClick={() => doAction(item)} className={`min-h-[44px] rounded-lg px-3 transition hover:bg-[#eaf5fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ef6e5a] ${item === "Home" ? "text-[#0872bb]" : ""}`}>{item}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <button aria-label="Search" onClick={() => doAction("Search")} className="grid h-11 w-11 place-items-center rounded-full text-[#31576f] transition hover:bg-[#eaf5fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ef6e5a]"><Search size={20} /></button>
            <button onClick={() => doAction("Account")} className="hidden min-h-[44px] items-center gap-2 rounded-full border border-[#cbdce6] bg-white px-2.5 pr-3 text-[13px] font-bold text-[#254b65] transition hover:bg-[#eaf5fb] sm:flex"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#dcecf5] text-[#0872bb]">M</span>Maria</button>
            <button aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)} className="grid h-11 w-11 place-items-center rounded-xl border border-[#dce7ec] text-[#31576f] md:hidden">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
          </div>
        </div>
        {menuOpen && <div className="border-t border-[#e3edf1] bg-[#fffefd] px-4 py-3 md:hidden">{["Home", "Appointments", "Messages", "Health record", "Billing"].map((item) => <button key={item} onClick={() => { doAction(item); setMenuOpen(false); }} className="block min-h-[44px] w-full rounded-lg px-3 text-left text-sm font-bold text-[#36546b] hover:bg-[#eaf5fb]">{item}</button>)}</div>}
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
        <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-[#b9ddec] bg-[#e9f7fd] px-3 py-2.5 text-[13px] font-medium text-[#215a7b] shadow-sm"><ShieldCheck size={17} className="shrink-0 text-[#0872bb]" />{notice}<button onClick={() => setNotice("All caught up for now.")} className="ml-auto min-h-[30px] px-1 font-bold underline underline-offset-2">Dismiss</button></div>
        <section className="mb-6 flex items-end justify-between gap-4">
          <div><p className="mb-1 text-[13px] font-bold uppercase tracking-[.12em] text-[#6b8494]">Thursday, March 27</p><h1 className="font-['Bricolage_Grotesque',sans-serif] text-[30px] font-semibold tracking-[-.055em] text-[#123750] sm:text-[38px]">Good morning, Maria.</h1><p className="mt-1 text-[15px] text-[#597187]">Your care at a glance.</p></div>
          <button onClick={() => doAction("Profile settings")} className="hidden min-h-[44px] items-center gap-2 rounded-xl border border-[#cadde7] bg-[#fffefd] px-4 text-[13px] font-bold text-[#24516d] hover:bg-[#edf7fb] sm:flex"><UserRound size={17} />Manage profile</button>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.55fr_.9fr]" aria-label="Care next">
          <article className="relative overflow-hidden rounded-[24px] bg-[#0b629d] px-5 py-5 text-white shadow-[0_12px_28px_rgba(17,87,130,.19)] sm:p-7">
            <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full border-[25px] border-[#3f91c4] opacity-40" /><div className="absolute bottom-[-76px] right-24 h-36 w-36 rounded-full bg-[#1d7ab4] opacity-60" />
            <div className="relative"><div className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.13em] text-[#bce5fa]"><CalendarDays size={16} />Up next</div>
              <div className="flex gap-4 sm:gap-6"><div className="flex w-[78px] shrink-0 flex-col items-center justify-center rounded-2xl bg-white px-2 py-3 text-[#105e91]"><b className="text-xs uppercase tracking-[.14em]">Apr</b><strong className="font-['Bricolage_Grotesque',sans-serif] text-[38px] leading-none">16</strong><span className="text-xs font-bold">Wed</span></div>
                <div className="min-w-0"><p className="text-sm font-bold text-[#c9eafa]">10:30 AM EDT</p><h2 className="mt-1 font-['Bricolage_Grotesque',sans-serif] text-[23px] font-semibold tracking-[-.035em] sm:text-[26px]">Office visit with<br className="hidden sm:block" /> Dr. Elena Carter</h2><p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#d8edf8]"><Home size={14} />CARNET Medical Center</p></div></div>
              <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => doAction("Appointment details")} className="min-h-[44px] rounded-xl bg-white px-4 text-[13px] font-bold text-[#075b92] transition hover:bg-[#e6f5fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">View details</button><button onClick={() => doAction("Reschedule request")} className="min-h-[44px] rounded-xl border border-[#8bc4e4] px-4 text-[13px] font-bold hover:bg-white/10">Reschedule</button></div>
            </div>
          </article>
          <article className="rounded-[24px] border border-[#dbe7e9] bg-[#fffefd] p-5 shadow-[0_8px_23px_rgba(29,74,96,.06)] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[12px] font-bold uppercase tracking-[.13em] text-[#6c8291]">Care tools</p><h2 className="mt-1 font-['Bricolage_Grotesque',sans-serif] text-[22px] font-semibold tracking-[-.04em]">How can we help?</h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0eb] text-[#cc5e44]"><Stethoscope size={20} /></span></div><div className="mt-4 grid gap-2"><button onClick={() => doAction("Schedule a visit")} className="flex min-h-[48px] items-center justify-between rounded-xl bg-[#f0f8fb] px-3.5 text-left text-[13px] font-bold text-[#176491] hover:bg-[#e0f2f9]">Schedule a visit <ChevronRight size={18} /></button><button onClick={() => doAction("Symptom checker")} className="flex min-h-[48px] items-center justify-between rounded-xl bg-[#fff6f0] px-3.5 text-left text-[13px] font-bold text-[#a4513d] hover:bg-[#ffede2]">Check your symptoms <ChevronRight size={18} /></button></div></article>
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.45fr]">
          <article className="rounded-[22px] border border-[#dbe7e9] bg-[#fffefd] p-5 shadow-[0_8px_23px_rgba(29,74,96,.05)]"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef1ff] text-[#5668b3]"><MessageCircle size={20} /></span><div><h2 className="font-['Bricolage_Grotesque',sans-serif] text-[19px] font-semibold tracking-[-.035em]">Messages</h2><p className="text-xs font-bold text-[#d45d4d]">3 unread</p></div></div><button onClick={() => doAction("All messages")} className="min-h-[40px] text-[13px] font-bold text-[#0872bb] hover:underline">View all</button></div>
            <button onClick={() => doAction("Care plan update")} className="mt-5 w-full rounded-xl border-t border-[#e7eef1] pt-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ef6e5a]"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbe8df] font-bold text-[#b4573d]">EC</span><span className="min-w-0"><span className="flex items-center justify-between gap-3"><b className="text-[14px]">Your care plan update</b><small className="shrink-0 text-xs text-[#748a99]">Mar 21</small></span><span className="mt-0.5 block text-[13px] text-[#557084]">Dr. Elena Carter</span><span className="mt-1 block truncate text-[13px] text-[#6b8292]">I reviewed your recent results and updated your care plan.</span></span></div></button>
          </article>
          <section aria-label="Health actions"><div className="mb-3 flex items-end justify-between"><div><p className="text-[12px] font-bold uppercase tracking-[.13em] text-[#6c8291]">Your health</p><h2 className="font-['Bricolage_Grotesque',sans-serif] text-[22px] font-semibold tracking-[-.04em]">Quick access</h2></div><button onClick={() => setDirectoryOpen(!directoryOpen)} className="min-h-[40px] text-[13px] font-bold text-[#0872bb] hover:underline">{directoryOpen ? "Show less" : "All services"}</button></div>
            <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 ${directoryOpen ? "md:grid-cols-4" : "md:grid-cols-4"}`}>{actions.slice(0, directoryOpen ? actions.length : 8).map(action => <ActionTile key={action.label} action={action} onClick={() => doAction(action.label)} />)}</div>
          </section>
        </section>
        <section className="mt-7 rounded-[22px] border border-[#d7e6df] bg-[#eaf7f2] p-5 sm:flex sm:items-center sm:justify-between sm:p-6"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#167b68]"><Activity size={21} /></span><div><h2 className="font-['Bricolage_Grotesque',sans-serif] text-[19px] font-semibold tracking-[-.035em]">Your latest health metric is ready</h2><p className="mt-1 text-[13px] text-[#50776e]">Your blood pressure trend from March 24 has been added.</p></div></div><button onClick={() => doAction("Health metrics")} className="mt-4 flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167b68] px-4 text-[13px] font-bold text-white hover:bg-[#106656] sm:mt-0">View metrics <ArrowRight size={16} /></button></section>
      </div>
      <footer className="border-t border-[#dce7ec] bg-[#eaf1f3] px-4 py-6 text-center text-[12px] text-[#668092]"><div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-3 sm:flex-row"><span className="flex items-center gap-1.5"><ShieldCheck size={15} />Your health information is private and protected.</span><span>Copyright 2025 CARNET by Argilette</span></div></footer>
    </main>
  );
}