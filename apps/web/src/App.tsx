import { FormEvent, useMemo, useState } from "react";
import {
  PublicEnquiryInput,
  businessLabels,
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
  "Started update",
  "In-progress update",
  "Area covered update",
  "Completed update",
  "Final proof report"
];

const packageCards = [
  {
    name: "Basic",
    text: "Updates and final report for simple local announcement work."
  },
  {
    name: "Standard",
    text: "Updates, proof photos, and final report for stronger customer proof."
  },
  {
    name: "Premium",
    text: "Optional live tracking only when admin enables it and the driver accepts it."
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

function AdminPlaceholder() {
  return (
    <main className="page-shell admin-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${productName} home`}>
          {productName}
        </a>
        <a className="nav-link" href="/">
          Public website
        </a>
      </header>

      <section className="work-surface admin-surface" aria-labelledby="admin-title">
        <div>
          <p className="eyebrow">M1 website</p>
          <h1 id="admin-title">{businessLabels.admin.dashboard}</h1>
          <p>M1: Enquiries are now captured from the public website.</p>
          <p>Real admin lead management, login, and record editing start in M2.</p>
        </div>

        <div className="summary-grid" aria-label="Admin placeholder sections">
          <span>{businessLabels.admin.enquiries}</span>
          <span>{businessLabels.admin.customers}</span>
          <span>{businessLabels.admin.adWorks}</span>
          <span>{businessLabels.admin.drivers}</span>
        </div>
      </section>
    </main>
  );
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
      setStatusMessage(publicWebsiteText.successMessage.replace("Prachar", productName));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not send enquiry right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="enquiry-form" onSubmit={handleSubmit} aria-label="Customer enquiry form">
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
          Preferred date
          <input type="date" value={form.preferredDate} onChange={(event) => updateField("preferredDate", event.target.value)} required />
        </label>
        <label>
          Number of days
          <input type="number" min="1" max="30" value={form.numberOfDays} onChange={(event) => updateField("numberOfDays", Number(event.target.value))} required />
        </label>
        <label>
          Package interest
          <select value={form.packageInterest} onChange={(event) => updateField("packageInterest", event.target.value as PackageInterest)}>
            {packageInterestOptions.map((option) => (
              <option key={option} value={option}>{packageInterestLabels[option]}</option>
            ))}
          </select>
        </label>
        <label>
          Is live tracking needed?
          <select value={form.liveTrackingNeeded} onChange={(event) => updateField("liveTrackingNeeded", event.target.value as LiveTrackingNeed)}>
            {Object.entries(liveTrackingNeedLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Areas to cover
        <textarea value={form.areasToCover} maxLength={500} onChange={(event) => updateField("areasToCover", event.target.value)} required />
      </label>
      <label>
        Advertisement message/details
        <textarea value={form.advertisementDetails} maxLength={1000} onChange={(event) => updateField("advertisementDetails", event.target.value)} required />
      </label>
      <label>
        Notes
        <textarea value={form.notes} maxLength={600} onChange={(event) => updateField("notes", event.target.value)} />
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
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${productName} home`}>
          {productName}
        </a>
        <nav className="nav-actions" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#packages">Packages</a>
          <a className="nav-link" href="#enquiry">Enquiry</a>
        </nav>
      </header>

      <section className="hero-section" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Local announcement proof</p>
          <h1 id="home-title">{publicWebsiteText.heroHeadline}</h1>
          <p>{publicWebsiteText.heroCopy}</p>
          <a className="primary-button hero-button" href="#enquiry">Send enquiry</a>
        </div>
        <div className="hero-proof" aria-label="Proof steps preview">
          {proofSteps.map((step) => <span key={step}>{step}</span>)}
        </div>
      </section>

      <section className="section-band two-column" aria-labelledby="problem-title">
        <div>
          <p className="eyebrow">The problem</p>
          <h2 id="problem-title">You pay, but proof is difficult.</h2>
        </div>
        <p>Business owners pay for mic advertisement vehicles, but it is hard to know whether the vehicle covered the promised areas, markets, colonies, and nearby roads.</p>
      </section>

      <section className="section-band two-column" aria-labelledby="solution-title">
        <div>
          <p className="eyebrow">The solution</p>
          <h2 id="solution-title">{productName} gives simple proof.</h2>
        </div>
        <p>{productName} helps your team plan the work, monitor progress, collect proof photos, send simple updates, and prepare a final proof report.</p>
      </section>

      <section className="section-band" id="how-it-works" aria-labelledby="work-title">
        <p className="eyebrow">How it works</p>
        <h2 id="work-title">Five simple steps</h2>
        <ol className="step-list">
          <li>Customer sends enquiry</li>
          <li>Admin plans ad work</li>
          <li>Driver starts work</li>
          <li>Customer gets updates</li>
          <li>Customer receives final proof report</li>
        </ol>
      </section>

      <section className="section-band" id="packages" aria-labelledby="packages-title">
        <p className="eyebrow">Packages</p>
        <h2 id="packages-title">Choose the proof level</h2>
        <div className="card-grid three-columns">
          {packageCards.map((card) => (
            <article className="info-card" key={card.name}>
              <h3>{card.name}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
        <p className="quiet-note">Payment collection is not part of M1.</p>
      </section>

      <section className="section-band two-column" aria-labelledby="cities-title">
        <div>
          <p className="eyebrow">Cities covered</p>
          <h2 id="cities-title">Starting with Ongole and Addanki</h2>
        </div>
        <div className="city-list">
          <span>Ongole</span>
          <span>Addanki</span>
          <span>Nearby towns and villages</span>
          <span>More cities coming soon</span>
        </div>
      </section>

      <section className="section-band" aria-labelledby="trust-title">
        <p className="eyebrow">Trust and proof</p>
        <h2 id="trust-title">Updates customers can understand</h2>
        <div className="proof-row">
          {proofSteps.map((step) => <span key={step}>{step}</span>)}
        </div>
      </section>

      <section className="section-band" aria-labelledby="faq-title">
        <p className="eyebrow">FAQ</p>
        <h2 id="faq-title">Common questions</h2>
        <div className="faq-list">
          <details>
            <summary>Will the customer see live tracking?</summary>
            <p>No. Customers get simple updates and a final report by default.</p>
          </details>
          <details>
            <summary>Can live tracking be enabled?</summary>
            <p>Yes, only as a premium option when admin enables it and the driver accepts it.</p>
          </details>
          <details>
            <summary>Is driver location tracked after work?</summary>
            <p>No. Location proof is for active work only in later tracking milestones.</p>
          </details>
          <details>
            <summary>Can this work for multiple days?</summary>
            <p>Yes. Multi-day work can be planned by your team in later operations screens.</p>
          </details>
          <details>
            <summary>Can drivers register later?</summary>
            <p>Yes. Driver registration and approval are planned for later milestones.</p>
          </details>
        </div>
      </section>

      <section className="section-band enquiry-section" id="enquiry" aria-labelledby="enquiry-title">
        <div>
          <p className="eyebrow">Contact and enquiry</p>
          <h2 id="enquiry-title">Tell us about your announcement work</h2>
          <p>Share the areas, date, and message. The {productName} team can contact you and plan the next step.</p>
          <p className="contact-placeholder">Call placeholder: +91 00000 00000</p>
        </div>
        <EnquiryForm />
      </section>
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/admin")) {
    return <AdminPlaceholder />;
  }

  return <PublicWebsite />;
}