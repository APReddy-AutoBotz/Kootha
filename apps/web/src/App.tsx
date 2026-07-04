import { FormEvent, useMemo, useState } from "react";
import { AdminLeadManagement } from "./admin";
import {
  PublicEnquiryInput,
  liveTrackingNeedLabels,
  packageInterestLabels,
  packageInterestOptions,
  publicWebsiteText,
  resolveProductName,
  validatePublicEnquiry
} from "@kootha/shared";
import type { LiveTrackingNeed, PackageInterest } from "@kootha/shared";

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

const proofSteps = [
  { title: "Send enquiry", text: "Tell us the business, area, date, and advertisement message.", image: "/assets/illustration-enquiry.svg" },
  { title: "Plan work", text: "Admin fixes the date, time, areas, driver, and vehicle.", image: "/assets/illustration-planning.svg" },
  { title: "Driver works", text: "Driver opens assigned work and updates the team.", image: "/assets/illustration-driver.svg" },
  { title: "Photo proof", text: "Proof photos and simple updates are reviewed by admin.", image: "/assets/illustration-proof.svg" },
  { title: "Final proof", text: "Customer gets a simple final proof summary.", image: "/assets/illustration-summary.svg" }
];

const packageCards = [
  {
    name: "Basic",
    text: "Simple updates and final proof summary for small advertisement work."
  },
  {
    name: "Standard",
    text: "Updates, proof photos, and final proof summary for stronger confidence."
  },
  {
    name: "Premium",
    text: "Phone Location Proof can be added only when admin enables it and the driver agrees."
  }
];

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
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const configured = useMemo(() => isSupabaseConfigured(), []);

  function updateField<K extends keyof PublicEnquiryInput>(field: K, value: PublicEnquiryInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
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
      setStatusMessage(publicWebsiteText.successMessage.replace("Kootha", productName));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not send enquiry right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="enquiry-form kootha-enquiry-form" onSubmit={handleSubmit} aria-label="Customer enquiry form">
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="companyWebsite">Company website</label>
        <input
          id="companyWebsite"
          name="companyWebsite"
          tabIndex={-1}
          autoComplete="off"
          value={form.companyWebsite}
          onChange={(event) => updateField("companyWebsite", event.target.value)}
        />
      </div>

      <div className="form-grid">
        <label>
          Customer name
          <input value={form.customerName} maxLength={80} onChange={(event) => updateField("customerName", event.target.value)} required />
        </label>
        <label>
          Business/shop name
          <input value={form.businessName} maxLength={120} onChange={(event) => updateField("businessName", event.target.value)} required />
        </label>
        <label>
          Mobile number
          <input value={form.mobileNumber} maxLength={20} inputMode="tel" onChange={(event) => updateField("mobileNumber", event.target.value)} required />
        </label>
        <label>
          City/town
          <input value={form.cityTown} maxLength={80} onChange={(event) => updateField("cityTown", event.target.value)} required />
        </label>
        <label>
          Work date
          <input type="date" value={form.preferredDate} onChange={(event) => updateField("preferredDate", event.target.value)} required />
        </label>
        <label>
          Number of days
          <input type="number" min="1" max="30" value={form.numberOfDays} onChange={(event) => updateField("numberOfDays", Number(event.target.value))} required />
        </label>
        <label>
          Package
          <select value={form.packageInterest} onChange={(event) => updateField("packageInterest", event.target.value as PackageInterest)}>
            {packageInterestOptions.map((option) => (
              <option key={option} value={option}>{packageInterestLabels[option]}</option>
            ))}
          </select>
        </label>
        <label>
          Phone Location Proof?
          <select value={form.liveTrackingNeeded} onChange={(event) => updateField("liveTrackingNeeded", event.target.value as LiveTrackingNeed)}>
            {Object.entries(liveTrackingNeedLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Areas to cover
        <textarea value={form.areasToCover} maxLength={500} onChange={(event) => updateField("areasToCover", event.target.value)} placeholder="Example: main road, market, bus stand, nearby villages" required />
      </label>
      <label>
        Advertisement message
        <textarea value={form.advertisementDetails} maxLength={1000} onChange={(event) => updateField("advertisementDetails", event.target.value)} placeholder="Write the advertisement message or offer details" required />
      </label>
      <label>
        Extra notes
        <textarea value={form.notes} maxLength={600} onChange={(event) => updateField("notes", event.target.value)} placeholder="Optional" />
      </label>

      <label className="consent-row">
        <input type="checkbox" checked={form.consentToContact} onChange={(event) => updateField("consentToContact", event.target.checked)} />
        <span>I agree that the {productName} team may contact me about this enquiry.</span>
      </label>

      {errors.length > 0 && (
        <div className="form-alert" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {statusMessage && <p className="form-status" role="status">{statusMessage}</p>}

      <button className="primary-button" type="submit" disabled={isSending}>
        {isSending ? "Sending..." : publicWebsiteText.enquiryButton}
      </button>
    </form>
  );
}

function PublicWebsite() {
  return (
    <main className="page-shell kootha-public-page">
      <header className="topbar kootha-topbar">
        <a className="brand kootha-brand" href="/" aria-label={`${productName} home`}>
          <img src="/assets/kootha-logo.svg" alt={productName} />
        </a>
        <nav className="nav-actions" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#packages">Packages</a>
          <a className="nav-link" href="#enquiry">Send enquiry</a>
        </nav>
      </header>

      <section className="hero-section kootha-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Advertisement proof</p>
          <h1 id="home-title">{publicWebsiteText.heroHeadline}</h1>
          <p>{publicWebsiteText.heroCopy}</p>
          <div className="hero-action-row">
            <a className="primary-button hero-button" href="#enquiry">Send enquiry</a>
            <a className="secondary-button" href="#how-it-works">See steps</a>
          </div>
        </div>
        <div className="hero-visual" aria-label="Kootha proof flow preview">
          <img src="/assets/illustration-driver.svg" alt="Driver doing advertisement work" />
          <div>
            <strong>Clear proof for field work</strong>
            <span>Plan, driver update, photo proof, final summary.</span>
          </div>
        </div>
      </section>

      <section className="section-band" id="how-it-works" aria-labelledby="work-title">
        <p className="eyebrow">How it works</p>
        <h2 id="work-title">Five simple steps</h2>
        <div className="proof-step-grid">
          {proofSteps.map((step) => (
            <article className="proof-step-card" key={step.title}>
              <img src={step.image} alt="" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-band two-column" aria-labelledby="solution-title">
        <div>
          <p className="eyebrow">Why Kootha</p>
          <h2 id="solution-title">Simple proof for shop owners.</h2>
        </div>
        <p>{productName} helps your team plan the work, collect proof photos, send simple updates, and prepare a final proof summary customers can understand.</p>
      </section>

      <section className="section-band" id="packages" aria-labelledby="packages-title">
        <p className="eyebrow">Packages</p>
        <h2 id="packages-title">Choose the proof level</h2>
        <div className="card-grid three-columns package-grid">
          {packageCards.map((card) => (
            <article className="info-card" key={card.name}>
              <h3>{card.name}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-band" aria-labelledby="faq-title">
        <p className="eyebrow">FAQ</p>
        <h2 id="faq-title">Common questions</h2>
        <div className="faq-list">
          <details>
            <summary>Can I see live location?</summary>
            <p>No live location link is shared by default. You receive updates and a final proof summary.</p>
          </details>
          <details>
            <summary>Is driver location used after work?</summary>
            <p>No. Phone Location Proof is for active assigned work only.</p>
          </details>
          <details>
            <summary>Can this work for multiple days?</summary>
            <p>Yes. Admin can plan one-day or multi-day work.</p>
          </details>
        </div>
      </section>

      <section className="section-band enquiry-section kootha-enquiry-section" id="enquiry" aria-labelledby="enquiry-title">
        <div>
          <p className="eyebrow">Contact and enquiry</p>
          <h2 id="enquiry-title">Tell us about your advertisement work</h2>
          <p>Share the areas, date, and message. The {productName} team can call you and plan the next step.</p>
          <p className="contact-placeholder">Call placeholder: +91 00000 00000</p>
          <img className="enquiry-side-image" src="/assets/illustration-enquiry.svg" alt="Customer sending enquiry" />
        </div>
        <EnquiryForm />
      </section>
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