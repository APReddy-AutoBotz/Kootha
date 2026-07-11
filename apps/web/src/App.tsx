import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  MapPin,
  Megaphone,
  Phone,
  ShieldCheck
} from "lucide-react";
import { AdminLeadManagement } from "./admin";
import {
  PublicEnquiryInput,
  publicWebsiteText,
  resolveProductName,
  validatePublicEnquiry
} from "@kootha/shared";

const productName = resolveProductName({
  productName: import.meta.env.VITE_PRODUCT_NAME
});

const initialEnquiry: PublicEnquiryInput = {
  customerName: "",
  businessName: "",
  mobileNumber: "",
  cityTown: "",
  areasToCover: "",
  preferredDate: "",
  numberOfDays: 1,
  advertisementDetails: "",
  packageInterest: "not_sure",
  liveTrackingNeeded: "not_sure",
  notes: "",
  consentToContact: false,
  companyWebsite: ""
};

const serviceSteps = [
  {
    number: "01",
    title: "Tell us the work",
    text: "Share your business, town, preferred date, and advertisement message.",
    icon: Megaphone
  },
  {
    number: "02",
    title: "We plan it clearly",
    text: "The team confirms the areas, timing, driver, vehicle, and proof needed.",
    icon: CalendarDays
  },
  {
    number: "03",
    title: "The driver completes it",
    text: "The driver follows the plan and sends work updates and photo proof.",
    icon: Camera
  },
  {
    number: "04",
    title: "You receive proof",
    text: "Admin reviews the work and prepares one simple final proof summary.",
    icon: CheckCircle2
  }
];

function getPublicContact() {
  const phone = import.meta.env.VITE_CONTACT_PHONE?.trim() ?? "";
  const display = import.meta.env.VITE_CONTACT_PHONE_DISPLAY?.trim() ?? "";
  const configured = phone && !phone.includes("replace-with");

  return configured ? { phone, display: display && !display.includes("replace-with") ? display : phone } : null;
}

function isSupabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  return Boolean(
    url &&
    anonKey &&
    !url.includes("your-project") &&
    !anonKey.includes("replace-with")
  );
}

async function submitEnquiry(input: PublicEnquiryInput) {
  const url = import.meta.env.VITE_SUPABASE_URL.trim().replace(/\/$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY.trim();
  const publicKeyHeader = ["api", "key"].join("");
  const response = await fetch(`${url}/rest/v1/enquiries`, {
    method: "POST",
    headers: {
      [publicKeyHeader]: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      customer_name: input.customerName.trim(),
      business_name: input.businessName.trim(),
      phone: input.mobileNumber.trim(),
      city: input.cityTown.trim(),
      required_areas: input.areasToCover.trim(),
      preferred_start_date: input.preferredDate,
      number_of_days: input.numberOfDays,
      source: "website",
      status: "new",
      message: input.advertisementDetails.trim(),
      package_interest: input.packageInterest,
      live_tracking_needed: input.liveTrackingNeeded,
      notes: input.notes.trim(),
      consent_to_contact: input.consentToContact
    })
  });

  if (!response.ok) {
    throw new Error("Could not send enquiry right now. Please try again later.");
  }
}

function EnquiryForm() {
  const [form, setForm] = useState<PublicEnquiryInput>(initialEnquiry);
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const configured = useMemo(() => isSupabaseConfigured(), []);

  function updateField<K extends keyof PublicEnquiryInput>(field: K, value: PublicEnquiryInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function continueToWorkDetails() {
    const firstStepErrors = [
      !form.customerName.trim() ? "Customer name is required." : "",
      !form.businessName.trim() ? "Business or shop name is required." : "",
      !/^\+?[0-9][0-9\s-]{7,18}$/.test(form.mobileNumber.trim()) ? "Enter a valid mobile number." : "",
      !form.cityTown.trim() ? "City or town is required." : ""
    ].filter(Boolean);

    setErrors(firstStepErrors);
    if (firstStepErrors.length === 0) {
      setStep(2);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");

    const validationErrors = validatePublicEnquiry(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!configured) {
      setErrors([]);
      setStatusMessage(publicWebsiteText.onlineNotConfigured);
      return;
    }

    try {
      setErrors([]);
      setIsSending(true);
      await submitEnquiry(form);
      setForm(initialEnquiry);
      setStep(1);
      setStatusMessage(publicWebsiteText.successMessage.replace("Kootha", productName));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not send enquiry right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="enquiry-form kootha-enquiry-form" onSubmit={handleSubmit} aria-label="Customer enquiry form">
      <input
        className="honeypot"
        hidden
        aria-hidden="true"
        name="companyWebsite"
        tabIndex={-1}
        autoComplete="off"
        value={form.companyWebsite}
        onChange={(event) => updateField("companyWebsite", event.target.value)}
      />

      <div className="form-progress" aria-label={`Enquiry step ${step} of 2`}>
        <span className="form-progress-copy">Step {step} of 2</span>
        <span className="form-progress-track"><span style={{ width: step === 1 ? "50%" : "100%" }} /></span>
      </div>

      {step === 1 ? (
        <div className="form-step">
          <div className="form-step-heading">
            <span className="form-step-number">1</span>
            <div>
              <h3>Your contact details</h3>
              <p>We use these details only to discuss this enquiry.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Your name
              <input value={form.customerName} maxLength={80} autoComplete="name" onChange={(event) => updateField("customerName", event.target.value)} required />
            </label>
            <label>
              Business or shop name
              <input value={form.businessName} maxLength={120} autoComplete="organization" onChange={(event) => updateField("businessName", event.target.value)} required />
            </label>
            <label>
              Mobile number
              <input value={form.mobileNumber} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="Your 10-digit mobile number" onChange={(event) => updateField("mobileNumber", event.target.value)} required />
            </label>
            <label>
              City or town
              <input value={form.cityTown} maxLength={80} autoComplete="address-level2" placeholder="Example: Ongole" onChange={(event) => updateField("cityTown", event.target.value)} required />
            </label>
          </div>
          <button className="primary-button form-next-button" type="button" onClick={continueToWorkDetails}>
            Continue <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="form-step">
          <div className="form-step-heading">
            <span className="form-step-number">2</span>
            <div>
              <h3>Advertisement work</h3>
              <p>Approximate details are enough. Our team will confirm the plan with you.</p>
            </div>
          </div>
          <label>
            Advertisement message
            <textarea value={form.advertisementDetails} maxLength={1000} onChange={(event) => updateField("advertisementDetails", event.target.value)} placeholder="What should people know about your shop, offer, event, or service?" required />
          </label>
          <div className="form-grid">
            <label>
              Preferred work date
              <input type="date" value={form.preferredDate} onChange={(event) => updateField("preferredDate", event.target.value)} required />
            </label>
            <label>
              Number of days
              <input type="number" min="1" max="30" value={form.numberOfDays} onChange={(event) => updateField("numberOfDays", Number(event.target.value))} required />
            </label>
          </div>
          <label>
            Areas to cover
            <textarea value={form.areasToCover} maxLength={500} onChange={(event) => updateField("areasToCover", event.target.value)} placeholder="Example: main road, market, bus stand, nearby villages" required />
          </label>
          <details className="optional-details">
            <summary>Add a note (optional)</summary>
            <label>
              Anything else the team should know?
              <textarea value={form.notes} maxLength={600} onChange={(event) => updateField("notes", event.target.value)} placeholder="Timing, language, or other useful details" />
            </label>
          </details>
          <label className="consent-row">
            <input type="checkbox" checked={form.consentToContact} onChange={(event) => updateField("consentToContact", event.target.checked)} />
            <span>I agree that the {productName} team may contact me about this enquiry.</span>
          </label>
          <div className="form-action-row">
            <button className="text-button" type="button" onClick={() => { setErrors([]); setStep(1); }}>Back</button>
            <button className="primary-button" type="submit" disabled={isSending}>
              {isSending ? "Sending..." : "Send enquiry"}
            </button>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="form-alert" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {statusMessage && <p className="form-status" role="status">{statusMessage}</p>}
    </form>
  );
}

function PublicWebsite() {
  const contact = getPublicContact();

  return (
    <main className="page-shell kootha-public-page">
      <header className="topbar kootha-topbar">
        <a className="brand kootha-brand" href="/" aria-label={`${productName} home`}>
          <img src="/assets/kootha-logo.svg" alt={productName} />
        </a>
        <nav className="nav-actions" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#proof">What you receive</a>
          <a className="nav-link" href="#enquiry">Send enquiry</a>
        </nav>
      </header>

      <section className="kootha-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Advertisement work, made clear</p>
          <h1 id="home-title">Work planned clearly. Proof shared simply.</h1>
          <p>Kootha helps businesses arrange field advertisement work and receive useful proof after the work is done.</p>
          <div className="hero-action-row">
            <a className="primary-button hero-button" href="#enquiry">Send enquiry <ArrowRight size={20} aria-hidden="true" /></a>
            {contact && (
              <a className="secondary-button hero-call-button" href={`tel:${contact.phone}`}>
                <Phone size={19} aria-hidden="true" /> Call {contact.display}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Kootha service highlights">
        <span><ShieldCheck size={22} aria-hidden="true" /> Admin-reviewed proof</span>
        <span><MapPin size={22} aria-hidden="true" /> Work planned area by area</span>
        <span><Camera size={22} aria-hidden="true" /> Photo and work updates</span>
      </section>

      <section className="section-band process-section" id="how-it-works" aria-labelledby="work-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">How Kootha works</p>
            <h2 id="work-title">Four clear steps</h2>
          </div>
          <p>You do not need to understand technical tracking or reporting. The Kootha team manages the process.</p>
        </div>
        <ol className="service-timeline">
          {serviceSteps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.number}>
                <span className="timeline-number">{step.number}</span>
                <Icon size={26} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="proof-band" id="proof" aria-labelledby="proof-title">
        <div className="proof-band-copy">
          <p className="eyebrow">What you receive</p>
          <h2 id="proof-title">One simple record of the work</h2>
          <p>Proof is reviewed by the Kootha team before it is included in the final summary.</p>
        </div>
        <div className="proof-list">
          <span><CheckCircle2 aria-hidden="true" /> Planned dates and areas</span>
          <span><CheckCircle2 aria-hidden="true" /> Reviewed photo proof and updates</span>
          <span><CheckCircle2 aria-hidden="true" /> Customer-safe final proof summary</span>
        </div>
        <img src="/assets/illustration-summary.svg" alt="Simple final proof summary" />
      </section>

      <section className="section-band enquiry-section kootha-enquiry-section" id="enquiry" aria-labelledby="enquiry-title">
        <div className="enquiry-intro">
          <p className="eyebrow">Start here</p>
          <h2 id="enquiry-title">Tell us about your advertisement work</h2>
          <p>Share the basic details. The Kootha team will call you to confirm the areas, timing, and proof plan.</p>
          <div className="enquiry-promise">
            <ShieldCheck size={24} aria-hidden="true" />
            <span>Your enquiry is private and is reviewed only by the Kootha team.</span>
          </div>
          <img className="enquiry-side-image" src="/assets/illustration-enquiry.svg" alt="Customer sending an enquiry" />
        </div>
        <EnquiryForm />
      </section>

      <section className="section-band faq-section" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">Common questions</p>
          <h2 id="faq-title">Before you send an enquiry</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>What kinds of advertisement work can I request?</summary>
            <p>Shop promotions, offers, events, openings, public announcements, and other local field advertising can be planned.</p>
          </details>
          <details>
            <summary>Can the work continue for several days?</summary>
            <p>Yes. Tell us the approximate dates and areas. The team will confirm the daily plan with you.</p>
          </details>
          <details>
            <summary>Will customers see a live driver location?</summary>
            <p>No live location link is shared by default. Customers receive reviewed updates and a final proof summary.</p>
          </details>
        </div>
      </section>

      <footer className="site-footer">
        <img src="/assets/kootha-logo.svg" alt={productName} />
        <p>Clear advertisement work. Useful proof.</p>
      </footer>
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/admin")) {
    return <AdminLeadManagement productName={productName} />;
  }

  return <PublicWebsite />;
}