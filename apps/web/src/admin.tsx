import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  adWorkStatusOptions,
  businessLabels,
  enquiryStatusOptions,
  getAdWorkStatusLabel,
  getEnquiryStatusLabel,
  getPlannedEndDate,
  liveTrackingNeedLabels,
  liveTrackingNeedOptions,
  packageInterestLabels,
  packageInterestOptions
} from "@kootha/shared";
import type { AdWorkStatus, EnquiryStatus, LiveTrackingNeed, PackageInterest } from "@kootha/shared";

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

type AdWorkRecord = {
  id: string;
  customer_id: string | null;
  enquiry_id: string | null;
  title: string;
  city_id: string | null;
  start_date: string | null;
  end_date: string | null;
  customer_live_enabled: boolean;
  created_at: string;
  customer_name: string;
  business_name: string | null;
  customer_phone: string | null;
  city: string | null;
  areas_to_cover: string | null;
  advertisement_details: string | null;
  package_interest: PackageInterest;
  live_tracking_requested: LiveTrackingNeed;
  live_tracking_enabled: boolean;
  planning_status: AdWorkStatus;
  number_of_days: number;
  daily_start_time: string | null;
  daily_end_time: string | null;
  special_instructions: string | null;
  internal_planning_note: string | null;
  photo_proof_needed: boolean;
  audio_video_proof_needed: boolean;
  area_update_needed: boolean;
  final_report_needed: boolean;
  customer_update_scheduled: boolean;
  customer_update_started: boolean;
  customer_update_in_progress: boolean;
  customer_update_area_covered: boolean;
  customer_update_completed: boolean;
  customer_update_report_ready: boolean;
  updated_at: string | null;
};

type AdWorkDayRecord = {
  id: string;
  ad_work_id: string;
  work_date: string;
  planned_start_time: string | null;
  planned_end_time: string | null;
  planning_status: "planned";
  areas_to_cover: string | null;
  day_note: string | null;
  created_at: string;
  updated_at: string | null;
};

type CityRecord = {
  id: string;
  name: string;
  active: boolean;
};

type AreaRecord = {
  id: string;
  city_id: string;
  name: string;
  active: boolean;
};

type AdminView = "enquiries" | "adWorks" | "dashboard";

type AdminFilters = {
  status: string;
  city: string;
  packageInterest: string;
  liveTracking: string;
  search: string;
};

type AdWorkFilters = AdminFilters & {
  startDate: string;
  endDate: string;
};

type AdminDraft = {
  status: EnquiryStatus;
  internalNote: string;
  followUpDate: string;
  packageInterest: PackageInterest;
  adminRemark: string;
};

type AdWorkDraft = {
  customerName: string;
  businessName: string;
  mobileNumber: string;
  cityTown: string;
  title: string;
  advertisementDetails: string;
  packageInterest: PackageInterest;
  liveTrackingRequested: LiveTrackingNeed;
  liveTrackingEnabled: boolean;
  customerLiveEnabled: boolean;
  planningStatus: AdWorkStatus;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  dailyStartTime: string;
  dailyEndTime: string;
  areasToCover: string;
  specialInstructions: string;
  internalPlanningNote: string;
  photoProofNeeded: boolean;
  audioVideoProofNeeded: boolean;
  areaUpdateNeeded: boolean;
  finalReportNeeded: boolean;
  customerUpdateScheduled: boolean;
  customerUpdateStarted: boolean;
  customerUpdateInProgress: boolean;
  customerUpdateAreaCovered: boolean;
  customerUpdateCompleted: boolean;
  customerUpdateReportReady: boolean;
};

type DayDraft = {
  id: string;
  workDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  areasToCover: string;
  dayNote: string;
  planningStatus: "planned";
};

const adminSessionKey = "kootha-admin-session";
const publicKeyHeader = ["api", "key"].join("");
const adminRoles = new Set(["admin"]);
const emptyFilters: AdminFilters = {
  status: "all",
  city: "all",
  packageInterest: "all",
  liveTracking: "all",
  search: ""
};
const emptyAdWorkFilters: AdWorkFilters = {
  ...emptyFilters,
  startDate: "",
  endDate: ""
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

const adWorkSelectColumns = [
  "id",
  "customer_id",
  "enquiry_id",
  "title",
  "city_id",
  "start_date",
  "end_date",
  "customer_live_enabled",
  "created_at",
  "customer_name",
  "business_name",
  "customer_phone",
  "city",
  "areas_to_cover",
  "advertisement_details",
  "package_interest",
  "live_tracking_requested",
  "live_tracking_enabled",
  "planning_status",
  "number_of_days",
  "daily_start_time",
  "daily_end_time",
  "special_instructions",
  "internal_planning_note",
  "photo_proof_needed",
  "audio_video_proof_needed",
  "area_update_needed",
  "final_report_needed",
  "customer_update_scheduled",
  "customer_update_started",
  "customer_update_in_progress",
  "customer_update_area_covered",
  "customer_update_completed",
  "customer_update_report_ready",
  "updated_at"
].join(",");

const adWorkDaySelectColumns = [
  "id",
  "ad_work_id",
  "work_date",
  "planned_start_time",
  "planned_end_time",
  "planning_status",
  "areas_to_cover",
  "day_note",
  "created_at",
  "updated_at"
].join(",");

function getAdminSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("replace-with")) {
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
    Authorization: "Bearer " + (accessToken ?? config.anonKey)
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
  const response = await fetch(config.url + "/auth/v1/token?grant_type=password", {
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
  await fetch(config.url + "/auth/v1/logout", {
    method: "POST",
    headers: createHeaders(config, session.accessToken)
  });
}

async function fetchAdminProfile(config: SupabaseConfig, session: AuthSession): Promise<AdminProfile> {
  const response = await fetch(
    config.url + "/rest/v1/user_profiles?select=auth_user_id,display_name,role&auth_user_id=eq." + encodeURIComponent(session.user.id) + "&limit=1",
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
  const response = await fetch(config.url + "/rest/v1/enquiries?select=" + enquirySelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load enquiries.");
  }

  return await response.json() as EnquiryRecord[];
}

async function fetchAdminAdWorks(config: SupabaseConfig, session: AuthSession): Promise<AdWorkRecord[]> {
  const response = await fetch(config.url + "/rest/v1/ad_works?select=" + adWorkSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad works.");
  }

  return await response.json() as AdWorkRecord[];
}

async function fetchAdminAdWorkDays(config: SupabaseConfig, session: AuthSession): Promise<AdWorkDayRecord[]> {
  const response = await fetch(config.url + "/rest/v1/ad_work_days?select=" + adWorkDaySelectColumns + "&order=work_date.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad work days.");
  }

  return await response.json() as AdWorkDayRecord[];
}

async function fetchCities(config: SupabaseConfig, session: AuthSession): Promise<CityRecord[]> {
  const response = await fetch(config.url + "/rest/v1/cities?select=id,name,active&active=eq.true&order=name.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load cities.");
  }

  return await response.json() as CityRecord[];
}

async function fetchAreas(config: SupabaseConfig, session: AuthSession): Promise<AreaRecord[]> {
  const response = await fetch(config.url + "/rest/v1/areas?select=id,city_id,name,active&active=eq.true&order=name.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load areas.");
  }

  return await response.json() as AreaRecord[];
}

async function updateAdminEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string,
  draft: AdminDraft
) {
  const response = await fetch(config.url + "/rest/v1/enquiries?id=eq." + encodeURIComponent(enquiryId), {
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

async function createAdWorkFromEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string
): Promise<{ adWorkId: string; wasCreated: boolean }> {
  const response = await fetch(config.url + "/rest/v1/rpc/create_ad_work_from_enquiry", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({ p_enquiry_id: enquiryId })
  });

  if (!response.ok) {
    throw new Error("Could not create ad work from this enquiry.");
  }

  const payload = await response.json() as { ad_work_id: string; was_created: boolean }[];
  const result = payload[0];

  if (!result?.ad_work_id) {
    throw new Error("Ad work was not returned.");
  }

  return {
    adWorkId: result.ad_work_id,
    wasCreated: result.was_created
  };
}

async function updateAdminAdWork(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  draft: AdWorkDraft
) {
  const response = await fetch(config.url + "/rest/v1/ad_works?id=eq." + encodeURIComponent(adWorkId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      customer_name: draft.customerName.trim(),
      business_name: draft.businessName.trim() || null,
      customer_phone: draft.mobileNumber.trim() || null,
      city: draft.cityTown.trim() || null,
      title: draft.title.trim() || "Ad Work",
      advertisement_details: draft.advertisementDetails.trim() || null,
      package_interest: draft.packageInterest,
      live_tracking_requested: draft.liveTrackingRequested,
      live_tracking_enabled: false,
      customer_live_enabled: false,
      planning_status: draft.planningStatus,
      start_date: draft.startDate || null,
      end_date: draft.endDate || null,
      number_of_days: Math.max(1, draft.numberOfDays),
      daily_start_time: draft.dailyStartTime || null,
      daily_end_time: draft.dailyEndTime || null,
      areas_to_cover: draft.areasToCover.trim() || null,
      special_instructions: draft.specialInstructions.trim() || null,
      internal_planning_note: draft.internalPlanningNote.trim() || null,
      photo_proof_needed: draft.photoProofNeeded,
      audio_video_proof_needed: draft.audioVideoProofNeeded,
      area_update_needed: draft.areaUpdateNeeded,
      final_report_needed: draft.finalReportNeeded,
      customer_update_scheduled: draft.customerUpdateScheduled,
      customer_update_started: draft.customerUpdateStarted,
      customer_update_in_progress: draft.customerUpdateInProgress,
      customer_update_area_covered: draft.customerUpdateAreaCovered,
      customer_update_completed: draft.customerUpdateCompleted,
      customer_update_report_ready: draft.customerUpdateReportReady,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save ad work changes.");
  }
}

async function syncAdWorkDays(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  draft: AdWorkDraft
) {
  const response = await fetch(config.url + "/rest/v1/rpc/sync_ad_work_days", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_start_date: draft.startDate,
      p_number_of_days: Math.max(1, draft.numberOfDays),
      p_daily_start_time: draft.dailyStartTime || null,
      p_daily_end_time: draft.dailyEndTime || null,
      p_areas_to_cover: draft.areasToCover.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not sync day-wise schedule.");
  }
}

async function updateAdminAdWorkDay(
  config: SupabaseConfig,
  session: AuthSession,
  day: DayDraft
) {
  const response = await fetch(config.url + "/rest/v1/ad_work_days?id=eq." + encodeURIComponent(day.id), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      work_date: day.workDate,
      planned_start_time: day.plannedStartTime || null,
      planned_end_time: day.plannedEndTime || null,
      areas_to_cover: day.areasToCover.trim() || null,
      day_note: day.dayNote.trim() || null,
      planning_status: "planned",
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save a day-wise schedule row.");
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

function toTimeInput(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

function toAdWorkDraft(adWork: AdWorkRecord): AdWorkDraft {
  return {
    customerName: adWork.customer_name ?? "",
    businessName: adWork.business_name ?? "",
    mobileNumber: adWork.customer_phone ?? "",
    cityTown: adWork.city ?? "",
    title: adWork.title ?? "",
    advertisementDetails: adWork.advertisement_details ?? "",
    packageInterest: adWork.package_interest ?? "not_sure",
    liveTrackingRequested: adWork.live_tracking_requested ?? "not_sure",
    liveTrackingEnabled: false,
    customerLiveEnabled: false,
    planningStatus: adWork.planning_status ?? "draft",
    startDate: adWork.start_date ?? "",
    endDate: adWork.end_date ?? "",
    numberOfDays: adWork.number_of_days || 1,
    dailyStartTime: toTimeInput(adWork.daily_start_time),
    dailyEndTime: toTimeInput(adWork.daily_end_time),
    areasToCover: adWork.areas_to_cover ?? "",
    specialInstructions: adWork.special_instructions ?? "",
    internalPlanningNote: adWork.internal_planning_note ?? "",
    photoProofNeeded: adWork.photo_proof_needed,
    audioVideoProofNeeded: adWork.audio_video_proof_needed,
    areaUpdateNeeded: adWork.area_update_needed,
    finalReportNeeded: adWork.final_report_needed,
    customerUpdateScheduled: adWork.customer_update_scheduled,
    customerUpdateStarted: adWork.customer_update_started,
    customerUpdateInProgress: adWork.customer_update_in_progress,
    customerUpdateAreaCovered: adWork.customer_update_area_covered,
    customerUpdateCompleted: adWork.customer_update_completed,
    customerUpdateReportReady: adWork.customer_update_report_ready
  };
}

function toDayDraft(day: AdWorkDayRecord): DayDraft {
  return {
    id: day.id,
    workDate: day.work_date,
    plannedStartTime: toTimeInput(day.planned_start_time),
    plannedEndTime: toTimeInput(day.planned_end_time),
    areasToCover: day.areas_to_cover ?? "",
    dayNote: day.day_note ?? "",
    planningStatus: "planned"
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

function uniqueCitiesFromEnquiries(enquiries: EnquiryRecord[]) {
  return [...new Set(enquiries.map((enquiry) => enquiry.city).filter(Boolean))].sort();
}

function uniqueCitiesFromAdWorks(adWorks: AdWorkRecord[]) {
  return [...new Set(adWorks.map((adWork) => adWork.city ?? "").filter(Boolean))].sort();
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

function filterAdWorks(adWorks: AdWorkRecord[], filters: AdWorkFilters) {
  const search = filters.search.trim().toLowerCase();

  return adWorks.filter((adWork) => {
    if (filters.status !== "all" && adWork.planning_status !== filters.status) {
      return false;
    }

    if (filters.city !== "all" && adWork.city !== filters.city) {
      return false;
    }

    if (filters.packageInterest !== "all" && adWork.package_interest !== filters.packageInterest) {
      return false;
    }

    if (filters.liveTracking !== "all" && adWork.live_tracking_requested !== filters.liveTracking) {
      return false;
    }

    if (filters.startDate && (!adWork.start_date || adWork.start_date < filters.startDate)) {
      return false;
    }

    if (filters.endDate && (!adWork.start_date || adWork.start_date > filters.endDate)) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      adWork.customer_name,
      adWork.business_name ?? "",
      adWork.customer_phone ?? "",
      adWork.city ?? ""
    ].join(" ").toLowerCase().includes(search);
  });
}

function getAdWorkReference(id: string) {
  return "AW-" + id.slice(0, 8).toUpperCase();
}

function DashboardCards({ adWorks }: { adWorks: AdWorkRecord[] }) {
  const cards = [
    {
      label: "Planned ad works",
      value: adWorks.filter((adWork) => adWork.planning_status === "planned").length
    },
    {
      label: "Ready for driver assignment",
      value: adWorks.filter((adWork) => adWork.planning_status === "ready_for_driver_assignment").length
    },
    {
      label: "Premium live tracking requests",
      value: adWorks.filter((adWork) => adWork.package_interest === "premium" && adWork.live_tracking_requested === "yes").length
    },
    {
      label: "Multi-day ad works",
      value: adWorks.filter((adWork) => adWork.number_of_days > 1).length
    },
    {
      label: "On-hold ad works",
      value: adWorks.filter((adWork) => adWork.planning_status === "on_hold").length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Admin ad work summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function EnquirySummaryCards({ enquiries }: { enquiries: EnquiryRecord[] }) {
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
  onLogout,
  activeView,
  onViewChange
}: {
  productName: string;
  children: ReactNode;
  profile?: AdminProfile | null;
  onLogout?: () => void;
  activeView?: AdminView;
  onViewChange?: (view: AdminView) => void;
}) {
  const navItems: { id: AdminView; label: string }[] = [
    { id: "enquiries", label: businessLabels.admin.enquiries },
    { id: "adWorks", label: businessLabels.admin.adWorks },
    { id: "dashboard", label: businessLabels.admin.dashboard }
  ];

  return (
    <main className="page-shell admin-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={productName + " home"}>
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
      {profile && activeView && onViewChange && (
        <nav className="admin-nav-tabs" aria-label="Admin navigation">
          {navItems.map((item) => (
            <button
              className={item.id === activeView ? "is-active" : ""}
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
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
          <p>Log in to manage enquiries and planned ad works.</p>
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
  const [activeView, setActiveView] = useState<AdminView>("enquiries");
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [adWorks, setAdWorks] = useState<AdWorkRecord[]>([]);
  const [adWorkDays, setAdWorkDays] = useState<AdWorkDayRecord[]>([]);
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [areas, setAreas] = useState<AreaRecord[]>([]);
  const [filters, setFilters] = useState<AdminFilters>(emptyFilters);
  const [adWorkFilters, setAdWorkFilters] = useState<AdWorkFilters>(emptyAdWorkFilters);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null);
  const [selectedAdWorkId, setSelectedAdWorkId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [adWorkDraft, setAdWorkDraft] = useState<AdWorkDraft | null>(null);
  const [dayDrafts, setDayDrafts] = useState<DayDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingAdWork, setIsCreatingAdWork] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const selectedEnquiry = enquiries.find((enquiry) => enquiry.id === selectedEnquiryId) ?? null;
  const selectedAdWork = adWorks.find((adWork) => adWork.id === selectedAdWorkId) ?? null;
  const selectedAdWorkDays = useMemo(
    () => adWorkDays.filter((day) => day.ad_work_id === selectedAdWorkId).sort((left, right) => left.work_date.localeCompare(right.work_date)),
    [adWorkDays, selectedAdWorkId]
  );
  const enquiryCityOptions = useMemo(() => uniqueCitiesFromEnquiries(enquiries), [enquiries]);
  const adWorkCityOptions = useMemo(() => uniqueCitiesFromAdWorks(adWorks), [adWorks]);
  const filteredEnquiries = useMemo(() => filterEnquiries(enquiries, filters), [enquiries, filters]);
  const filteredAdWorks = useMemo(() => filterAdWorks(adWorks, adWorkFilters), [adWorks, adWorkFilters]);
  const existingAdWorkForSelectedEnquiry = selectedEnquiry
    ? adWorks.find((adWork) => adWork.enquiry_id === selectedEnquiry.id) ?? null
    : null;

  useEffect(() => {
    if (!selectedEnquiry) {
      setDraft(null);
      return;
    }

    setDraft(toDraft(selectedEnquiry));
  }, [selectedEnquiry]);

  useEffect(() => {
    if (!selectedAdWork) {
      setAdWorkDraft(null);
      setDayDrafts([]);
      return;
    }

    setAdWorkDraft(toAdWorkDraft(selectedAdWork));
    setDayDrafts(selectedAdWorkDays.map(toDayDraft));
  }, [selectedAdWork, selectedAdWorkDays]);

  async function loadData() {
    if (!config || !session) {
      return;
    }

    const activeConfig = config;
    const activeSession = session;

    setIsLoading(true);
    setLoadError("");

    try {
      const adminProfile = await fetchAdminProfile(activeConfig, activeSession);
      const [enquiryRows, adWorkRows, adWorkDayRows, cityRows, areaRows] = await Promise.all([
        fetchAdminEnquiries(activeConfig, activeSession),
        fetchAdminAdWorks(activeConfig, activeSession),
        fetchAdminAdWorkDays(activeConfig, activeSession),
        fetchCities(activeConfig, activeSession),
        fetchAreas(activeConfig, activeSession)
      ]);

      setProfile(adminProfile);
      setEnquiries(enquiryRows);
      setAdWorks(adWorkRows);
      setAdWorkDays(adWorkDayRows);
      setCities(cityRows);
      setAreas(areaRows);
      setSelectedEnquiryId((current) => current && enquiryRows.some((enquiry) => enquiry.id === current) ? current : enquiryRows[0]?.id ?? null);
      setSelectedAdWorkId((current) => current && adWorkRows.some((adWork) => adWork.id === current) ? current : adWorkRows[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [config, session]);

  async function handleLogout() {
    if (config && session) {
      await logoutAdmin(config, session).catch(() => undefined);
    }
    clearStoredSession();
    setSession(null);
    setProfile(null);
    setEnquiries([]);
    setAdWorks([]);
    setAdWorkDays([]);
    setSelectedEnquiryId(null);
    setSelectedAdWorkId(null);
    setDraft(null);
    setAdWorkDraft(null);
    setDayDrafts([]);
    setLoadError("");
  }

  async function handleRefresh() {
    await loadData();
  }

  async function handleSaveEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config || !session || !selectedEnquiry || !draft) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      await updateAdminEnquiry(config, session, selectedEnquiry.id, draft);
      await loadData();
      setSaveMessage("Enquiry updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save enquiry changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAdWork() {
    if (!config || !session || !selectedEnquiry) {
      return;
    }

    if (existingAdWorkForSelectedEnquiry) {
      setSelectedAdWorkId(existingAdWorkForSelectedEnquiry.id);
      setActiveView("adWorks");
      setSaveMessage("Existing ad work opened.");
      return;
    }

    setIsCreatingAdWork(true);
    setSaveMessage("");

    try {
      const result = await createAdWorkFromEnquiry(config, session, selectedEnquiry.id);
      await loadData();
      setSelectedAdWorkId(result.adWorkId);
      setActiveView("adWorks");
      setSaveMessage(result.wasCreated ? "Ad work created." : "Existing ad work opened.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not create ad work.");
    } finally {
      setIsCreatingAdWork(false);
    }
  }

  async function handleSaveAdWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config || !session || !selectedAdWork || !adWorkDraft) {
      return;
    }

    const scheduleChanged =
      adWorkDraft.startDate !== (selectedAdWork.start_date ?? "") ||
      adWorkDraft.numberOfDays !== selectedAdWork.number_of_days ||
      adWorkDraft.dailyStartTime !== toTimeInput(selectedAdWork.daily_start_time) ||
      adWorkDraft.dailyEndTime !== toTimeInput(selectedAdWork.daily_end_time) ||
      adWorkDraft.areasToCover.trim() !== (selectedAdWork.areas_to_cover ?? "");

    setIsSaving(true);
    setSaveMessage("");

    try {
      await updateAdminAdWork(config, session, selectedAdWork.id, adWorkDraft);

      if (scheduleChanged && adWorkDraft.startDate) {
        await syncAdWorkDays(config, session, selectedAdWork.id, adWorkDraft);
      } else {
        await Promise.all(dayDrafts.map((day) => updateAdminAdWorkDay(config, session, day)));
      }

      await loadData();
      setSaveMessage("Ad work updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save ad work changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateAdWorkDraft<K extends keyof AdWorkDraft>(field: K, value: AdWorkDraft[K]) {
    setAdWorkDraft((current) => current && { ...current, [field]: value });
  }

  function updateScheduleDate(field: "startDate" | "endDate", value: string) {
    setAdWorkDraft((current) => {
      if (!current) {
        return current;
      }

      if (field === "startDate") {
        return {
          ...current,
          startDate: value,
          endDate: getPlannedEndDate(value, current.numberOfDays)
        };
      }

      return {
        ...current,
        endDate: value
      };
    });
  }

  function updateNumberOfDays(value: number) {
    const nextDays = Number.isInteger(value) && value > 0 ? value : 1;
    setAdWorkDraft((current) => current && {
      ...current,
      numberOfDays: nextDays,
      endDate: getPlannedEndDate(current.startDate, nextDays)
    });
  }

  function updateDayDraft<K extends keyof DayDraft>(dayId: string, field: K, value: DayDraft[K]) {
    setDayDrafts((current) => current.map((day) => (
      day.id === dayId ? { ...day, [field]: value } : day
    )));
  }

  function appendAreaName(areaName: string) {
    if (!areaName) {
      return;
    }

    setAdWorkDraft((current) => current && {
      ...current,
      areasToCover: current.areasToCover.trim()
        ? current.areasToCover.trim() + ", " + areaName
        : areaName
    });
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
    <AdminShell
      productName={productName}
      profile={profile}
      onLogout={handleLogout}
      activeView={activeView}
      onViewChange={(view) => {
        setActiveView(view);
        setSaveMessage("");
      }}
    >
      <section className="work-surface admin-surface" aria-labelledby="admin-title">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 id="admin-title">
              {activeView === "dashboard" && businessLabels.admin.dashboard}
              {activeView === "enquiries" && businessLabels.admin.enquiries}
              {activeView === "adWorks" && businessLabels.admin.adWorks}
            </h1>
            <p>
              {activeView === "dashboard" && "Review planned work before later operations."}
              {activeView === "enquiries" && "View enquiries, follow up with customers, and create planned ad work."}
              {activeView === "adWorks" && "Plan advertisement work, schedules, areas, proof needed, and customer updates."}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {activeView === "dashboard" && <DashboardCards adWorks={adWorks} />}
        {activeView === "enquiries" && <EnquirySummaryCards enquiries={enquiries} />}

        {loadError && <p className="form-alert admin-message" role="alert">{loadError}</p>}
        {saveMessage && <p className="form-status admin-message" role="status">{saveMessage}</p>}

        {activeView === "dashboard" && (
          <section className="admin-dashboard-panel" aria-labelledby="dashboard-work-title">
            <h2 id="dashboard-work-title">Planning snapshot</h2>
            <div className="admin-dashboard-list">
              {adWorks.slice(0, 6).map((adWork) => (
                <button
                  className="dashboard-work-row"
                  type="button"
                  key={adWork.id}
                  onClick={() => {
                    setSelectedAdWorkId(adWork.id);
                    setActiveView("adWorks");
                  }}
                >
                  <span>
                    <strong>{getAdWorkReference(adWork.id)}</strong>
                    <small>{adWork.business_name || adWork.customer_name}</small>
                  </span>
                  <span>{adWork.city || "City not set"}</span>
                  <span>{formatDate(adWork.start_date)}</span>
                  <span className="status-pill">{getAdWorkStatusLabel(adWork.planning_status)}</span>
                </button>
              ))}
              {!isLoading && adWorks.length === 0 && (
                <p className="quiet-note">No ad works are planned yet.</p>
              )}
            </div>
          </section>
        )}

        {activeView === "enquiries" && (
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
                    {enquiryCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
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
                    {liveTrackingNeedOptions.map((option) => (
                      <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lead-list">
                {filteredEnquiries.map((enquiry) => (
                  <button
                    className={enquiry.id === selectedEnquiryId ? "lead-row is-selected" : "lead-row"}
                    type="button"
                    key={enquiry.id}
                    onClick={() => setSelectedEnquiryId(enquiry.id)}
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
                    <div>
                      <dt>Ad work</dt>
                      <dd>{existingAdWorkForSelectedEnquiry ? getAdWorkReference(existingAdWorkForSelectedEnquiry.id) : "Not created"}</dd>
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

                  <form className="admin-edit-form" onSubmit={handleSaveEnquiry}>
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

                    <div className="admin-action-row">
                      <button className="primary-button" type="submit" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save enquiry"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isCreatingAdWork}
                        onClick={handleCreateAdWork}
                      >
                        {existingAdWorkForSelectedEnquiry ? "Open Ad Work" : isCreatingAdWork ? "Creating..." : "Create Ad Work"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}

        {activeView === "adWorks" && (
          <div className="admin-lead-layout ad-work-layout">
            <section className="lead-list-panel" aria-labelledby="ad-work-list-title">
              <div className="panel-heading">
                <h2 id="ad-work-list-title">Ad Works</h2>
                <span>{filteredAdWorks.length} shown</span>
              </div>

              <div className="admin-filter-grid" aria-label="Ad work filters">
                <label>
                  Search
                  <input
                    value={adWorkFilters.search}
                    placeholder="Name, shop, mobile"
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, search: event.target.value }))}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={adWorkFilters.status}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="all">All statuses</option>
                    {adWorkStatusOptions.map((status) => (
                      <option key={status} value={status}>{getAdWorkStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City/town
                  <select
                    value={adWorkFilters.city}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, city: event.target.value }))}
                  >
                    <option value="all">All cities</option>
                    {adWorkCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </label>
                <label>
                  Package
                  <select
                    value={adWorkFilters.packageInterest}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, packageInterest: event.target.value }))}
                  >
                    <option value="all">All packages</option>
                    {packageInterestOptions.map((option) => (
                      <option key={option} value={option}>{packageInterestLabels[option]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Live tracking requested
                  <select
                    value={adWorkFilters.liveTracking}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, liveTracking: event.target.value }))}
                  >
                    <option value="all">All answers</option>
                    {liveTrackingNeedOptions.map((option) => (
                      <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  From date
                  <input
                    type="date"
                    value={adWorkFilters.startDate}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label>
                  To date
                  <input
                    type="date"
                    value={adWorkFilters.endDate}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </label>
              </div>

              <div className="lead-list">
                {filteredAdWorks.map((adWork) => (
                  <button
                    className={adWork.id === selectedAdWorkId ? "ad-work-row is-selected" : "ad-work-row"}
                    type="button"
                    key={adWork.id}
                    onClick={() => setSelectedAdWorkId(adWork.id)}
                  >
                    <span>
                      <strong>{getAdWorkReference(adWork.id)}</strong>
                      <small>{adWork.business_name || adWork.customer_name}</small>
                    </span>
                    <span>{adWork.customer_name}</span>
                    <span>{adWork.city || "Not set"}</span>
                    <span>{packageInterestLabels[adWork.package_interest]}</span>
                    <span>{formatDate(adWork.start_date)}</span>
                    <span>{formatDate(adWork.end_date)}</span>
                    <span>{adWork.number_of_days} day{adWork.number_of_days === 1 ? "" : "s"}</span>
                    <span>{liveTrackingNeedLabels[adWork.live_tracking_requested]}</span>
                    <span className="status-pill">{getAdWorkStatusLabel(adWork.planning_status)}</span>
                    <span>{formatDate(adWork.created_at)}</span>
                  </button>
                ))}
                {!isLoading && filteredAdWorks.length === 0 && (
                  <p className="quiet-note">No ad works match the current filters.</p>
                )}
              </div>
            </section>

            <section className="lead-detail-panel ad-work-detail-panel" aria-labelledby="ad-work-detail-title">
              {!selectedAdWork || !adWorkDraft ? (
                <div>
                  <h2 id="ad-work-detail-title">Ad work details</h2>
                  <p>Select a planned ad work to view details.</p>
                </div>
              ) : (
                <form className="admin-edit-form ad-work-form" onSubmit={handleSaveAdWork}>
                  <div className="panel-heading">
                    <div>
                      <h2 id="ad-work-detail-title">{adWorkDraft.title || "Ad Work"}</h2>
                      <p>{getAdWorkReference(selectedAdWork.id)} - {adWorkDraft.customerName}</p>
                    </div>
                    <span className="status-pill">{getAdWorkStatusLabel(adWorkDraft.planningStatus)}</span>
                  </div>

                  <section className="form-section" aria-labelledby="customer-details-title">
                    <h3 id="customer-details-title">Customer details</h3>
                    <div className="form-grid">
                      <label>
                        Customer name
                        <input
                          value={adWorkDraft.customerName}
                          maxLength={80}
                          onChange={(event) => updateAdWorkDraft("customerName", event.target.value)}
                        />
                      </label>
                      <label>
                        Business/shop name
                        <input
                          value={adWorkDraft.businessName}
                          maxLength={120}
                          onChange={(event) => updateAdWorkDraft("businessName", event.target.value)}
                        />
                      </label>
                      <label>
                        Mobile number
                        <input
                          value={adWorkDraft.mobileNumber}
                          maxLength={20}
                          inputMode="tel"
                          onChange={(event) => updateAdWorkDraft("mobileNumber", event.target.value)}
                        />
                      </label>
                      <label>
                        City/town
                        <input
                          value={adWorkDraft.cityTown}
                          maxLength={80}
                          list="admin-city-options"
                          onChange={(event) => updateAdWorkDraft("cityTown", event.target.value)}
                        />
                      </label>
                    </div>
                    <datalist id="admin-city-options">
                      {cities.map((city) => <option key={city.id} value={city.name} />)}
                    </datalist>
                  </section>

                  <section className="form-section" aria-labelledby="work-details-title">
                    <h3 id="work-details-title">Work details</h3>
                    <label>
                      Ad work title
                      <input
                        value={adWorkDraft.title}
                        maxLength={160}
                        onChange={(event) => updateAdWorkDraft("title", event.target.value)}
                      />
                    </label>
                    <label>
                      Advertisement message/details
                      <textarea
                        value={adWorkDraft.advertisementDetails}
                        maxLength={1200}
                        onChange={(event) => updateAdWorkDraft("advertisementDetails", event.target.value)}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Package
                        <select
                          value={adWorkDraft.packageInterest}
                          onChange={(event) => updateAdWorkDraft("packageInterest", event.target.value as PackageInterest)}
                        >
                          {packageInterestOptions.map((option) => (
                            <option key={option} value={option}>{packageInterestLabels[option]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Live tracking requested
                        <select
                          value={adWorkDraft.liveTrackingRequested}
                          onChange={(event) => updateAdWorkDraft("liveTrackingRequested", event.target.value as LiveTrackingNeed)}
                        >
                          {liveTrackingNeedOptions.map((option) => (
                            <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Live tracking enabled
                        <select value="no" disabled>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <label>
                        Planning status
                        <select
                          value={adWorkDraft.planningStatus}
                          onChange={(event) => updateAdWorkDraft("planningStatus", event.target.value as AdWorkStatus)}
                        >
                          {adWorkStatusOptions.map((status) => (
                            <option key={status} value={status}>{getAdWorkStatusLabel(status)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Special instructions
                      <textarea
                        value={adWorkDraft.specialInstructions}
                        maxLength={1000}
                        onChange={(event) => updateAdWorkDraft("specialInstructions", event.target.value)}
                      />
                    </label>
                    <label>
                      Internal planning note
                      <textarea
                        value={adWorkDraft.internalPlanningNote}
                        maxLength={1200}
                        onChange={(event) => updateAdWorkDraft("internalPlanningNote", event.target.value)}
                      />
                    </label>
                  </section>

                  <section className="form-section" aria-labelledby="schedule-title">
                    <h3 id="schedule-title">Schedule</h3>
                    <div className="form-grid">
                      <label>
                        Start date
                        <input
                          type="date"
                          value={adWorkDraft.startDate}
                          onChange={(event) => updateScheduleDate("startDate", event.target.value)}
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          value={adWorkDraft.endDate}
                          onChange={(event) => updateScheduleDate("endDate", event.target.value)}
                        />
                      </label>
                      <label>
                        Number of days
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={adWorkDraft.numberOfDays}
                          onChange={(event) => updateNumberOfDays(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        Daily start time
                        <input
                          type="time"
                          value={adWorkDraft.dailyStartTime}
                          onChange={(event) => updateAdWorkDraft("dailyStartTime", event.target.value)}
                        />
                      </label>
                      <label>
                        Daily end time
                        <input
                          type="time"
                          value={adWorkDraft.dailyEndTime}
                          onChange={(event) => updateAdWorkDraft("dailyEndTime", event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="form-section" aria-labelledby="areas-title">
                    <h3 id="areas-title">Areas to Cover</h3>
                    <div className="form-grid">
                      <label>
                        Existing area
                        <select defaultValue="" onChange={(event) => {
                          appendAreaName(event.target.value);
                          event.target.value = "";
                        }}>
                          <option value="">Add existing area</option>
                          {areas.map((area) => {
                            const city = cities.find((cityOption) => cityOption.id === area.city_id);
                            return (
                              <option key={area.id} value={area.name}>
                                {city ? city.name + " - " + area.name : area.name}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label>
                        Custom area text
                        <input
                          value=""
                          placeholder="Type in Areas to Cover below"
                          readOnly
                        />
                      </label>
                    </div>
                    <label>
                      Areas to cover
                      <textarea
                        value={adWorkDraft.areasToCover}
                        maxLength={1000}
                        onChange={(event) => updateAdWorkDraft("areasToCover", event.target.value)}
                      />
                    </label>
                  </section>

                  <section className="form-section" aria-labelledby="day-wise-title">
                    <h3 id="day-wise-title">Day-wise schedule</h3>
                    <div className="day-schedule-list">
                      {dayDrafts.map((day, index) => (
                        <div className="day-schedule-row" key={day.id}>
                          <strong>Day {index + 1}</strong>
                          <label>
                            Date
                            <input
                              type="date"
                              value={day.workDate}
                              onChange={(event) => updateDayDraft(day.id, "workDate", event.target.value)}
                            />
                          </label>
                          <label>
                            Start time
                            <input
                              type="time"
                              value={day.plannedStartTime}
                              onChange={(event) => updateDayDraft(day.id, "plannedStartTime", event.target.value)}
                            />
                          </label>
                          <label>
                            End time
                            <input
                              type="time"
                              value={day.plannedEndTime}
                              onChange={(event) => updateDayDraft(day.id, "plannedEndTime", event.target.value)}
                            />
                          </label>
                          <label>
                            Areas to cover
                            <textarea
                              value={day.areasToCover}
                              onChange={(event) => updateDayDraft(day.id, "areasToCover", event.target.value)}
                            />
                          </label>
                          <label>
                            Day note
                            <textarea
                              value={day.dayNote}
                              onChange={(event) => updateDayDraft(day.id, "dayNote", event.target.value)}
                            />
                          </label>
                          <span className="status-pill">{day.planningStatus === "planned" ? "Planned" : day.planningStatus}</span>
                        </div>
                      ))}
                      {dayDrafts.length === 0 && (
                        <p className="quiet-note">Save a start date and number of days to create day-wise rows.</p>
                      )}
                    </div>
                  </section>

                  <section className="form-section" aria-labelledby="proof-plan-title">
                    <h3 id="proof-plan-title">Proof Needed</h3>
                    <div className="checkbox-grid">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.photoProofNeeded}
                          onChange={(event) => updateAdWorkDraft("photoProofNeeded", event.target.checked)}
                        />
                        <span>Photo proof needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.audioVideoProofNeeded}
                          onChange={(event) => updateAdWorkDraft("audioVideoProofNeeded", event.target.checked)}
                        />
                        <span>Audio/video proof needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.areaUpdateNeeded}
                          onChange={(event) => updateAdWorkDraft("areaUpdateNeeded", event.target.checked)}
                        />
                        <span>Area update needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.finalReportNeeded}
                          onChange={(event) => updateAdWorkDraft("finalReportNeeded", event.target.checked)}
                        />
                        <span>Final report needed</span>
                      </label>
                    </div>
                  </section>

                  <section className="form-section" aria-labelledby="customer-update-title">
                    <h3 id="customer-update-title">Customer Updates</h3>
                    <div className="checkbox-grid">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateScheduled}
                          onChange={(event) => updateAdWorkDraft("customerUpdateScheduled", event.target.checked)}
                        />
                        <span>Scheduled update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateStarted}
                          onChange={(event) => updateAdWorkDraft("customerUpdateStarted", event.target.checked)}
                        />
                        <span>Started update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateInProgress}
                          onChange={(event) => updateAdWorkDraft("customerUpdateInProgress", event.target.checked)}
                        />
                        <span>In-progress update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateAreaCovered}
                          onChange={(event) => updateAdWorkDraft("customerUpdateAreaCovered", event.target.checked)}
                        />
                        <span>Area covered update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateCompleted}
                          onChange={(event) => updateAdWorkDraft("customerUpdateCompleted", event.target.checked)}
                        />
                        <span>Completed update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateReportReady}
                          onChange={(event) => updateAdWorkDraft("customerUpdateReportReady", event.target.checked)}
                        />
                        <span>Report ready update</span>
                      </label>
                    </div>
                  </section>

                  <div className="admin-action-row sticky-action-row">
                    <button className="primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save ad work"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
