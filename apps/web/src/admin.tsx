import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  businessLabels,
  enquiryStatusOptions,
  getEnquiryStatusLabel,
  liveTrackingNeedLabels,
  packageInterestLabels,
  packageInterestOptions
} from "@kootha/shared";
import type { EnquiryStatus, LiveTrackingNeed, PackageInterest } from "@kootha/shared";

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email?: string;
  };
};

type AdminProfile = {
  auth_user_id: string;
  display_name: string | null;
  role: string;
};

type EnquiryRecord = {
  id: string;
  customer_name: string;
  business_name: string;
  phone: string;
  city: string;
  required_areas: string | null;
  preferred_start_date: string | null;
  number_of_days: number;
  source: string;
  status: EnquiryStatus;
  message: string | null;
  created_at: string;
  package_interest: PackageInterest;
  live_tracking_needed: LiveTrackingNeed;
  notes: string | null;
  consent_to_contact: boolean;
  internal_note: string | null;
  follow_up_date: string | null;
  admin_remark: string | null;
  updated_at: string | null;
};

type AdminFilters = {
  status: string;
  city: string;
  packageInterest: string;
  liveTracking: string;
  search: string;
};

type AdminDraft = {
  status: EnquiryStatus;
  internalNote: string;
  followUpDate: string;
  packageInterest: PackageInterest;
  adminRemark: string;
};

const adminSessionKey = "kootha-admin-session";
const publicKeyHeader = ["api", "key"].join("");
const adminRoles = new Set(["owner", "admin"]);
const emptyFilters: AdminFilters = {
  status: "all",
  city: "all",
  packageInterest: "all",
  liveTracking: "all",
  search: ""
};

const enquirySelectColumns = [
  "id",
  "customer_name",
  "business_name",
  "phone",
  "city",
  "required_areas",
  "preferred_start_date",
  "number_of_days",
  "source",
  "status",
  "message",
  "created_at",
  "package_interest",
  "live_tracking_needed",
  "notes",
  "consent_to_contact",
  "internal_note",
  "follow_up_date",
  "admin_remark",
  "updated_at"
].join(",");

function getAdminSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (
    !url ||
    !anonKey ||
    url.includes("your-project") ||
    anonKey.includes("replace-with")
  ) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

function createHeaders(config: SupabaseConfig, accessToken?: string, includeJson = false) {
  const headers: Record<string, string> = {
    [publicKeyHeader]: config.anonKey,
    Authorization: `Bearer ${accessToken ?? config.anonKey}`
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function readStoredSession(): AuthSession | null {
  try {
    const rawSession = window.localStorage.getItem(adminSessionKey);
    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as AuthSession;
    if (!parsedSession.accessToken || !parsedSession.user?.id) {
      return null;
    }

    return parsedSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession) {
  window.localStorage.setItem(adminSessionKey, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(adminSessionKey);
}

async function loginAdmin(config: SupabaseConfig, email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: createHeaders(config, undefined, true),
    body: JSON.stringify({ email: email.trim(), password })
  });

  if (!response.ok) {
    throw new Error("Login failed. Check the email and password.");
  }

  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    user?: {
      id?: string;
      email?: string;
    };
  };

  if (!payload.access_token || !payload.user?.id) {
    throw new Error("Login did not return a valid admin session.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: {
      id: payload.user.id,
      email: payload.user.email
    }
  };
}

async function logoutAdmin(config: SupabaseConfig, session: AuthSession) {
  await fetch(`${config.url}/auth/v1/logout`, {
    method: "POST",
    headers: createHeaders(config, session.accessToken)
  });
}

async function fetchAdminProfile(config: SupabaseConfig, session: AuthSession): Promise<AdminProfile> {
  const response = await fetch(
    `${config.url}/rest/v1/user_profiles?select=auth_user_id,display_name,role&auth_user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    {
      headers: createHeaders(config, session.accessToken)
    }
  );

  if (!response.ok) {
    throw new Error("Could not verify admin access.");
  }

  const profiles = await response.json() as AdminProfile[];
  const profile = profiles[0];

  if (!profile || !adminRoles.has(profile.role)) {
    throw new Error("This account is not marked as an admin.");
  }

  return profile;
}

async function fetchAdminEnquiries(config: SupabaseConfig, session: AuthSession): Promise<EnquiryRecord[]> {
  const response = await fetch(
    `${config.url}/rest/v1/enquiries?select=${enquirySelectColumns}&order=created_at.desc`,
    {
      headers: createHeaders(config, session.accessToken)
    }
  );

  if (!response.ok) {
    throw new Error("Could not load enquiries.");
  }

  return await response.json() as EnquiryRecord[];
}

async function updateAdminEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string,
  draft: AdminDraft
) {
  const response = await fetch(`${config.url}/rest/v1/enquiries?id=eq.${encodeURIComponent(enquiryId)}`, {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      status: draft.status,
      internal_note: draft.internalNote.trim() || null,
      follow_up_date: draft.followUpDate || null,
      package_interest: draft.packageInterest,
      admin_remark: draft.adminRemark.trim() || null,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save enquiry changes.");
  }
}

function toDraft(enquiry: EnquiryRecord): AdminDraft {
  return {
    status: enquiry.status,
    internalNote: enquiry.internal_note ?? "",
    followUpDate: enquiry.follow_up_date ?? "",
    packageInterest: enquiry.package_interest,
    adminRemark: enquiry.admin_remark ?? ""
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function uniqueCities(enquiries: EnquiryRecord[]) {
  return [...new Set(enquiries.map((enquiry) => enquiry.city).filter(Boolean))].sort();
}

function filterEnquiries(enquiries: EnquiryRecord[], filters: AdminFilters) {
  const search = filters.search.trim().toLowerCase();

  return enquiries.filter((enquiry) => {
    if (filters.status !== "all" && enquiry.status !== filters.status) {
      return false;
    }

    if (filters.city !== "all" && enquiry.city !== filters.city) {
      return false;
    }

    if (filters.packageInterest !== "all" && enquiry.package_interest !== filters.packageInterest) {
      return false;
    }

    if (filters.liveTracking !== "all" && enquiry.live_tracking_needed !== filters.liveTracking) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      enquiry.customer_name,
      enquiry.business_name,
      enquiry.phone,
      enquiry.city
    ].join(" ").toLowerCase().includes(search);
  });
}

function SummaryCards({ enquiries }: { enquiries: EnquiryRecord[] }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cards = [
    {
      label: "New enquiries",
      value: enquiries.filter((enquiry) => enquiry.status === "new").length
    },
    {
      label: "Follow-up needed",
      value: enquiries.filter((enquiry) => enquiry.status === "follow_up_needed").length
    },
    {
      label: "Converted",
      value: enquiries.filter((enquiry) => enquiry.status === "converted").length
    },
    {
      label: "Premium interest",
      value: enquiries.filter((enquiry) => enquiry.package_interest === "premium").length
    },
    {
      label: "Today's enquiries",
      value: enquiries.filter((enquiry) => enquiry.created_at.startsWith(todayKey)).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Admin enquiry summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminShell({
  productName,
  children,
  profile,
  onLogout
}: {
  productName: string;
  children: React.ReactNode;
  profile?: AdminProfile | null;
  onLogout?: () => void;
}) {
  return (
    <main className="page-shell admin-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${productName} home`}>
          {productName}
        </a>
        <div className="admin-top-actions">
          <a className="nav-link" href="/">
            Public website
          </a>
          {profile && (
            <span className="admin-user">
              {profile.display_name || "Admin"}
            </span>
          )}
          {onLogout && (
            <button className="secondary-button" type="button" onClick={onLogout}>
              Logout
            </button>
          )}
        </div>
      </header>
      {children}
    </main>
  );
}

function AdminLogin({
  productName,
  config,
  onLogin
}: {
  productName: string;
  config: SupabaseConfig;
  onLogin: (session: AuthSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await loginAdmin(config, email, password);
      writeStoredSession(session);
      onLogin(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminShell productName={productName}>
      <section className="work-surface admin-surface admin-login-surface" aria-labelledby="admin-login-title">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-login-title">Admin Login</h1>
          <p>Log in to view and follow up on website enquiries.</p>
        </div>
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-alert admin-message" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>
      </section>
    </AdminShell>
  );
}

export function AdminLeadManagement({ productName }: { productName: string }) {
  const config = useMemo(() => getAdminSupabaseConfig(), []);
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [filters, setFilters] = useState<AdminFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const selectedEnquiry = enquiries.find((enquiry) => enquiry.id === selectedId) ?? null;
  const cityOptions = useMemo(() => uniqueCities(enquiries), [enquiries]);
  const filteredEnquiries = useMemo(() => filterEnquiries(enquiries, filters), [enquiries, filters]);

  useEffect(() => {
    if (!selectedEnquiry) {
      setDraft(null);
      return;
    }

    setDraft(toDraft(selectedEnquiry));
  }, [selectedEnquiry]);

  useEffect(() => {
    if (!config || !session) {
      return;
    }

    const activeConfig = config;
    const activeSession = session;
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setLoadError("");

      try {
        const adminProfile = await fetchAdminProfile(activeConfig, activeSession);
        const enquiryRows = await fetchAdminEnquiries(activeConfig, activeSession);

        if (cancelled) {
          return;
        }

        setProfile(adminProfile);
        setEnquiries(enquiryRows);
        setSelectedId((current) => current ?? enquiryRows[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load admin enquiries.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [config, session]);

  async function handleLogout() {
    if (config && session) {
      await logoutAdmin(config, session).catch(() => undefined);
    }
    clearStoredSession();
    setSession(null);
    setProfile(null);
    setEnquiries([]);
    setSelectedId(null);
    setDraft(null);
    setLoadError("");
  }

  async function handleRefresh() {
    if (!config || !session) {
      return;
    }

    const activeConfig = config;
    const activeSession = session;

    setIsLoading(true);
    setLoadError("");

    try {
      const enquiryRows = await fetchAdminEnquiries(activeConfig, activeSession);
      setEnquiries(enquiryRows);
      setSelectedId((current) => current ?? enquiryRows[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not refresh enquiries.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config || !session || !selectedEnquiry || !draft) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      await updateAdminEnquiry(config, session, selectedEnquiry.id, draft);
      setEnquiries((current) => current.map((enquiry) => {
        if (enquiry.id !== selectedEnquiry.id) {
          return enquiry;
        }

        return {
          ...enquiry,
          status: draft.status,
          internal_note: draft.internalNote.trim() || null,
          follow_up_date: draft.followUpDate || null,
          package_interest: draft.packageInterest,
          admin_remark: draft.adminRemark.trim() || null,
          updated_at: new Date().toISOString()
        };
      }));
      setSaveMessage("Lead updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save enquiry changes.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!config) {
    return (
      <AdminShell productName={productName}>
        <section className="work-surface admin-surface" aria-labelledby="admin-config-title">
          <p className="eyebrow">Admin</p>
          <h1 id="admin-config-title">{businessLabels.admin.leadManagement}</h1>
          <p className="form-status" role="status">Admin login is not configured in this environment.</p>
        </section>
      </AdminShell>
    );
  }

  if (!session) {
    return (
      <AdminLogin
        productName={productName}
        config={config}
        onLogin={(nextSession) => setSession(nextSession)}
      />
    );
  }

  return (
    <AdminShell productName={productName} profile={profile} onLogout={handleLogout}>
      <section className="work-surface admin-surface" aria-labelledby="admin-title">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 id="admin-title">{businessLabels.admin.leadManagement}</h1>
            <p>View website enquiries, follow up with customers, and prepare leads for M3 planning.</p>
          </div>
          <button className="secondary-button" type="button" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <SummaryCards enquiries={enquiries} />

        {loadError && <p className="form-alert admin-message" role="alert">{loadError}</p>}

        <div className="admin-lead-layout">
          <section className="lead-list-panel" aria-labelledby="lead-list-title">
            <div className="panel-heading">
              <h2 id="lead-list-title">Enquiries</h2>
              <span>{filteredEnquiries.length} shown</span>
            </div>

            <div className="admin-filter-grid" aria-label="Enquiry filters">
              <label>
                Search
                <input
                  value={filters.search}
                  placeholder="Name, shop, mobile"
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                />
              </label>
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">All statuses</option>
                  {enquiryStatusOptions.map((status) => (
                    <option key={status} value={status}>{getEnquiryStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label>
                City/town
                <select
                  value={filters.city}
                  onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                >
                  <option value="all">All cities</option>
                  {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </label>
              <label>
                Package
                <select
                  value={filters.packageInterest}
                  onChange={(event) => setFilters((current) => ({ ...current, packageInterest: event.target.value }))}
                >
                  <option value="all">All packages</option>
                  {packageInterestOptions.map((option) => (
                    <option key={option} value={option}>{packageInterestLabels[option]}</option>
                  ))}
                </select>
              </label>
              <label>
                Live tracking interest
                <select
                  value={filters.liveTracking}
                  onChange={(event) => setFilters((current) => ({ ...current, liveTracking: event.target.value }))}
                >
                  <option value="all">All answers</option>
                  {Object.entries(liveTrackingNeedLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="lead-list">
              {filteredEnquiries.map((enquiry) => (
                <button
                  className={`lead-row ${enquiry.id === selectedId ? "is-selected" : ""}`}
                  type="button"
                  key={enquiry.id}
                  onClick={() => setSelectedId(enquiry.id)}
                >
                  <span>
                    <strong>{enquiry.customer_name}</strong>
                    <small>{enquiry.business_name}</small>
                  </span>
                  <span>{enquiry.phone}</span>
                  <span>{enquiry.city}</span>
                  <span>{formatDate(enquiry.preferred_start_date)}</span>
                  <span>{enquiry.number_of_days} day{enquiry.number_of_days === 1 ? "" : "s"}</span>
                  <span>{packageInterestLabels[enquiry.package_interest]}</span>
                  <span>{liveTrackingNeedLabels[enquiry.live_tracking_needed]}</span>
                  <span className="status-pill">{getEnquiryStatusLabel(enquiry.status)}</span>
                  <span>{formatDate(enquiry.follow_up_date)}</span>
                </button>
              ))}
              {!isLoading && filteredEnquiries.length === 0 && (
                <p className="quiet-note">No enquiries match the current filters.</p>
              )}
            </div>
          </section>

          <section className="lead-detail-panel" aria-labelledby="lead-detail-title">
            {!selectedEnquiry || !draft ? (
              <div>
                <h2 id="lead-detail-title">Lead details</h2>
                <p>Select an enquiry to view details.</p>
              </div>
            ) : (
              <>
                <div className="panel-heading">
                  <div>
                    <h2 id="lead-detail-title">{selectedEnquiry.business_name}</h2>
                    <p>{selectedEnquiry.customer_name} - {selectedEnquiry.phone}</p>
                  </div>
                  <span className="status-pill">{getEnquiryStatusLabel(selectedEnquiry.status)}</span>
                </div>

                <dl className="lead-detail-grid">
                  <div>
                    <dt>Received</dt>
                    <dd>{formatDate(selectedEnquiry.created_at)}</dd>
                  </div>
                  <div>
                    <dt>City/town</dt>
                    <dd>{selectedEnquiry.city}</dd>
                  </div>
                  <div>
                    <dt>Preferred date</dt>
                    <dd>{formatDate(selectedEnquiry.preferred_start_date)}</dd>
                  </div>
                  <div>
                    <dt>Number of days</dt>
                    <dd>{selectedEnquiry.number_of_days}</dd>
                  </div>
                  <div>
                    <dt>Package interest</dt>
                    <dd>{packageInterestLabels[selectedEnquiry.package_interest]}</dd>
                  </div>
                  <div>
                    <dt>Live tracking interest</dt>
                    <dd>{liveTrackingNeedLabels[selectedEnquiry.live_tracking_needed]}</dd>
                  </div>
                  <div>
                    <dt>Consent</dt>
                    <dd>{selectedEnquiry.consent_to_contact ? "Yes" : "No"}</dd>
                  </div>
                </dl>

                <div className="lead-submitted-copy">
                  <h3>Areas to cover</h3>
                  <p>{selectedEnquiry.required_areas || "Not provided"}</p>
                  <h3>Advertisement message/details</h3>
                  <p>{selectedEnquiry.message || "Not provided"}</p>
                  <h3>Customer notes</h3>
                  <p>{selectedEnquiry.notes || "No notes"}</p>
                </div>

                <form className="admin-edit-form" onSubmit={handleSave}>
                  <div className="form-grid">
                    <label>
                      Status
                      <select
                        value={draft.status}
                        onChange={(event) => setDraft((current) => current && {
                          ...current,
                          status: event.target.value as EnquiryStatus
                        })}
                      >
                        {enquiryStatusOptions.map((status) => (
                          <option key={status} value={status}>{getEnquiryStatusLabel(status)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Follow-up date
                      <input
                        type="date"
                        value={draft.followUpDate}
                        onChange={(event) => setDraft((current) => current && {
                          ...current,
                          followUpDate: event.target.value
                        })}
                      />
                    </label>
                    <label>
                      Package interest
                      <select
                        value={draft.packageInterest}
                        onChange={(event) => setDraft((current) => current && {
                          ...current,
                          packageInterest: event.target.value as PackageInterest
                        })}
                      >
                        {packageInterestOptions.map((option) => (
                          <option key={option} value={option}>{packageInterestLabels[option]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Internal note
                    <textarea
                      value={draft.internalNote}
                      maxLength={1200}
                      onChange={(event) => setDraft((current) => current && {
                        ...current,
                        internalNote: event.target.value
                      })}
                    />
                  </label>
                  <label>
                    Admin remark
                    <textarea
                      value={draft.adminRemark}
                      maxLength={800}
                      onChange={(event) => setDraft((current) => current && {
                        ...current,
                        adminRemark: event.target.value
                      })}
                    />
                  </label>

                  {saveMessage && <p className="form-status admin-message" role="status">{saveMessage}</p>}

                  <div className="admin-action-row">
                    <button className="primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save lead"}
                    </button>
                    <button className="secondary-button" type="button" disabled>
                      Create Ad Work - coming in M3
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </section>
    </AdminShell>
  );
}
