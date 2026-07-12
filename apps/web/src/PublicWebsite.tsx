import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Camera, CheckCircle2, MapPin, Megaphone, Phone, ShieldCheck } from "lucide-react";
import { PublicEnquiryInput, publicWebsiteText, validatePublicEnquiry } from "@kootha/shared";

type Locale = "en" | "te";
const consentNoticeVersion = "2026-07-12";
const initialEnquiry: PublicEnquiryInput = { customerName: "", businessName: "", mobileNumber: "", cityTown: "", areasToCover: "", preferredDate: "", numberOfDays: 1, advertisementDetails: "", packageInterest: "not_sure", liveTrackingNeeded: "not_sure", notes: "", consentToContact: false, companyWebsite: "" };

const copy = {
  en: { language: "తెలుగు", how: "How it works", proof: "What you receive", send: "Send enquiry", eyebrow: "Advertisement work, made clear", headline: "Work planned clearly. Proof shared simply.", hero: "Kootha helps businesses arrange field advertisement work and receive useful proof after the work is done." },
  te: { language: "English", how: "ఎలా పనిచేస్తుంది", proof: "మీకు ఏమి అందుతుంది", send: "విచారణ పంపండి", eyebrow: "స్పష్టమైన ప్రకటన పని", headline: "పని స్పష్టంగా ప్లాన్ చేస్తాం. ఆధారం సులభంగా అందిస్తాం.", hero: "వ్యాపారాల కోసం ప్రకటన పనిని ఏర్పాటు చేసి, పని పూర్తయిన తర్వాత ఉపయోగకరమైన ఆధారాన్ని అందించడంలో కూత సహాయం చేస్తుంది." }
} as const;

const steps = [
  ["01", "Tell us the work", "Share your business, town, preferred date, and advertisement message.", Megaphone],
  ["02", "We plan it clearly", "The team confirms the areas, timing, driver, vehicle, and proof needed.", CalendarDays],
  ["03", "The driver completes it", "The driver follows the plan and sends work updates and photo proof.", Camera],
  ["04", "You receive proof", "Admin reviews the work and prepares one simple final proof summary.", CheckCircle2]
] as const;

function configured(value?: string) { return Boolean(value?.trim() && !value.includes("replace-with")); }

function Turnstile({ locale, onToken }: { locale: Locale; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    let widgetId: string | undefined;
    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      container.current.replaceChildren();
      widgetId = window.turnstile.render(container.current, { sitekey: siteKey, language: locale, callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    if (window.turnstile) render();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-kootha-turnstile]');
      const script = existing ?? document.createElement("script");
      script.addEventListener("load", render, { once: true });
      if (!existing) { script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.defer = true; script.dataset.koothaTurnstile = "true"; document.head.appendChild(script); }
    }
    return () => { cancelled = true; if (widgetId && window.turnstile) window.turnstile.remove(widgetId); };
  }, [locale, onToken, siteKey]);
  return <div className="turnstile-slot" ref={container} aria-label="Human verification" />;
}

async function submitEnquiry(input: PublicEnquiryInput, locale: Locale, turnstileToken: string) {
  const response = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, locale, turnstileToken, consentNoticeVersion }) });
  const result = await response.json().catch(() => ({})) as { message?: string; reference?: string };
  if (!response.ok) throw new Error(result.message || "Could not send enquiry right now. Please try again later.");
  return result;
}

function EnquiryForm({ locale }: { locale: Locale }) {
  const [form, setForm] = useState(initialEnquiry);
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState("");
  const onToken = useCallback((value: string) => setToken(value), []);
  const turnstileReady = configured(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const set = <K extends keyof PublicEnquiryInput>(key: K, value: PublicEnquiryInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  function next() {
    const nextErrors = [!form.customerName.trim() ? "Customer name is required." : "", !form.businessName.trim() ? "Business or shop name is required." : "", !/^\+?[0-9][0-9\s-]{7,18}$/.test(form.mobileNumber.trim()) ? "Enter a valid mobile number." : "", !form.cityTown.trim() ? "City or town is required." : ""].filter(Boolean);
    setErrors(nextErrors); if (!nextErrors.length) setStep(2);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const validation = validatePublicEnquiry(form); if (validation.length) { setErrors(validation); return; }
    if (!turnstileReady) { setErrors([]); setMessage(publicWebsiteText.onlineNotConfigured); return; }
    if (!token) { setMessage(locale === "te" ? "దయచేసి ధృవీకరణ పూర్తి చేయండి." : "Please complete the verification."); return; }
    try { setErrors([]); setSending(true); const result = await submitEnquiry(form, locale, token); setForm(initialEnquiry); setStep(1); setToken(""); setMessage((locale === "te" ? "విచారణ అందింది. కూత బృందం త్వరలో మిమ్మల్ని సంప్రదిస్తుంది." : publicWebsiteText.successMessage) + (result.reference ? ` Reference: ${result.reference}.` : "")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not send enquiry right now."); }
    finally { setSending(false); }
  }

  return <form className="enquiry-form kootha-enquiry-form" onSubmit={submit} aria-label="Customer enquiry form">
    <input className="honeypot" hidden aria-hidden="true" tabIndex={-1} autoComplete="off" value={form.companyWebsite} onChange={(e) => set("companyWebsite", e.target.value)} />
    <div className="form-progress"><span className="form-progress-copy">Step {step} of 2</span><span className="form-progress-track"><span style={{ width: step === 1 ? "50%" : "100%" }} /></span></div>
    {step === 1 ? <div className="form-step"><div className="form-step-heading"><span className="form-step-number">1</span><div><h3>Your contact details</h3><p>We use these details only to discuss this enquiry.</p></div></div><div className="form-grid">
      <label>Your name<input value={form.customerName} maxLength={80} autoComplete="name" onChange={(e) => set("customerName", e.target.value)} required /></label>
      <label>Business or shop name<input value={form.businessName} maxLength={120} autoComplete="organization" onChange={(e) => set("businessName", e.target.value)} required /></label>
      <label>Mobile number<input value={form.mobileNumber} maxLength={20} inputMode="tel" autoComplete="tel" onChange={(e) => set("mobileNumber", e.target.value)} required /></label>
      <label>City or town<input value={form.cityTown} maxLength={80} autoComplete="address-level2" onChange={(e) => set("cityTown", e.target.value)} required /></label>
    </div><button className="primary-button form-next-button" type="button" onClick={next}>Continue <ArrowRight size={20} /></button></div> :
    <div className="form-step"><div className="form-step-heading"><span className="form-step-number">2</span><div><h3>Advertisement work</h3><p>Approximate details are enough. Our team will confirm the plan.</p></div></div>
      <label>Advertisement message<textarea value={form.advertisementDetails} maxLength={1000} onChange={(e) => set("advertisementDetails", e.target.value)} required /></label>
      <div className="form-grid"><label>Preferred work date<input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)} required /></label><label>Number of days<input type="number" min="1" max="30" value={form.numberOfDays} onChange={(e) => set("numberOfDays", Number(e.target.value))} required /></label></div>
      <label>Areas to cover<textarea value={form.areasToCover} maxLength={500} onChange={(e) => set("areasToCover", e.target.value)} required /></label>
      <details className="optional-details"><summary>Add a note (optional)</summary><label>Anything else?<textarea value={form.notes} maxLength={600} onChange={(e) => set("notes", e.target.value)} /></label></details>
      <label className="consent-row"><input type="checkbox" checked={form.consentToContact} onChange={(e) => set("consentToContact", e.target.checked)} /><span>{locale === "te" ? "ఈ విచారణ గురించి కూత బృందం నన్ను సంప్రదించడానికి నేను అంగీకరిస్తున్నాను." : "I agree that the Kootha team may contact me about this enquiry."} <a href="/privacy">Privacy notice</a>.</span></label>
      {turnstileReady && <Turnstile locale={locale} onToken={onToken} />}
      <div className="form-action-row"><button className="text-button" type="button" onClick={() => { setErrors([]); setStep(1); }}>Back</button><button className="primary-button" disabled={sending}>{sending ? "Sending..." : copy[locale].send}</button></div>
    </div>}
    {!!errors.length && <div className="form-alert" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}{message && <p className="form-status" role="status">{message}</p>}
  </form>;
}

export function PublicWebsite() {
  const [locale, setLocale] = useState<Locale>(() => localStorage.getItem("kootha-locale") === "te" ? "te" : "en");
  const c = copy[locale];
  const phone = import.meta.env.VITE_CONTACT_PHONE?.trim();
  const contactReady = configured(phone);
  const changeLocale = () => { const next = locale === "en" ? "te" : "en"; localStorage.setItem("kootha-locale", next); document.documentElement.lang = next; setLocale(next); };
  return <main className="page-shell kootha-public-page">
    <header className="topbar kootha-topbar"><a className="brand kootha-brand" href="/"><img src="/assets/kootha-logo.svg" alt="Kootha" /></a><nav className="nav-actions"><a href="#how-it-works">{c.how}</a><a href="#proof">{c.proof}</a><a className="nav-link" href="#enquiry">{c.send}</a><button className="language-switch" type="button" onClick={changeLocale}>{c.language}</button></nav></header>
    <section className="kootha-hero"><div className="hero-copy"><p className="eyebrow">{c.eyebrow}</p><h1>{c.headline}</h1><p>{c.hero}</p><div className="hero-action-row"><a className="primary-button hero-button" href="#enquiry">{c.send} <ArrowRight size={20} /></a>{contactReady && <a className="secondary-button hero-call-button" href={`tel:${phone}`}><Phone size={19} /> Call</a>}</div></div></section>
    <section className="trust-strip"><span><ShieldCheck size={22} /> Admin-reviewed proof</span><span><MapPin size={22} /> Work planned area by area</span><span><Camera size={22} /> Photo and work updates</span></section>
    <section className="section-band process-section" id="how-it-works"><div className="section-heading-row"><div><p className="eyebrow">How Kootha works</p><h2>Four clear steps</h2></div><p>The Kootha team manages the process.</p></div><ol className="service-timeline">{steps.map(([number, title, text, Icon]) => <li key={number}><span className="timeline-number">{number}</span><Icon size={26} /><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
    <section className="proof-band" id="proof"><div className="proof-band-copy"><p className="eyebrow">What you receive</p><h2>One simple record of the work</h2><p>Proof is reviewed by the Kootha team before it is included in the final summary.</p></div><div className="proof-list"><span><CheckCircle2 /> Planned dates and areas</span><span><CheckCircle2 /> Reviewed photo proof and updates</span><span><CheckCircle2 /> Customer-safe final proof summary</span></div><img src="/assets/illustration-summary.svg" alt="Simple final proof summary" /></section>
    <section className="section-band enquiry-section kootha-enquiry-section" id="enquiry"><div className="enquiry-intro"><p className="eyebrow">Start here</p><h2>Tell us about your advertisement work</h2><p>Share the basic details. Availability, scope, schedule, proof, and payment are confirmed before work begins.</p><div className="enquiry-promise"><ShieldCheck size={24} /><span>Your enquiry is private and reviewed only by the Kootha team.</span></div><img className="enquiry-side-image" src="/assets/illustration-enquiry.svg" alt="Customer sending an enquiry" /></div><EnquiryForm locale={locale} /></section>
    <section className="section-band faq-section"><div><p className="eyebrow">Common questions</p><h2>Before you send an enquiry</h2></div><div className="faq-list"><details><summary>What advertisement work can I request?</summary><p>Shop promotions, offers, events, openings, public announcements, and other field advertising.</p></details><details><summary>Will customers see a live driver location?</summary><p>No. Customers receive reviewed updates and a final proof summary.</p></details></div></section>
    <footer className="site-footer"><img src="/assets/kootha-logo-tagline.svg" alt="Kootha - Your message. Everywhere." /><p>Clear advertisement work. Useful proof.</p><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/driver-consent">Driver consent</a><a href="/data-request">Data request</a></nav></footer>
  </main>;
}
