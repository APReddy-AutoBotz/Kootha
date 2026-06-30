import { businessLabels, resolveProductName } from "@kootha/shared";

const productName = resolveProductName({
  productName: import.meta.env.VITE_PRODUCT_NAME
});

function AdminPlaceholder() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${productName} home`}>
          {productName}
        </a>
        <a className="nav-link" href="/">
          Public website
        </a>
      </header>

      <section className="work-surface" aria-labelledby="admin-title">
        <div>
          <p className="eyebrow">M0 foundation</p>
          <h1 id="admin-title">{businessLabels.admin.dashboard}</h1>
          <p>
            Admin dashboard placeholder for enquiries, customers, ad works, drivers,
            vehicles, cities, areas, and settings.
          </p>
        </div>

        <div className="summary-grid" aria-label="Admin placeholder sections">
          <span>{businessLabels.admin.enquiries}</span>
          <span>{businessLabels.admin.customers}</span>
          <span>{businessLabels.admin.adWorks}</span>
          <span>{businessLabels.admin.drivers}</span>
          <span>{businessLabels.admin.vehicles}</span>
          <span>{businessLabels.admin.citiesAndAreas}</span>
        </div>
      </section>
    </main>
  );
}

function PublicPlaceholder() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${productName} home`}>
          {productName}
        </a>
        <a className="nav-link" href="/admin">
          Admin
        </a>
      </header>

      <section className="work-surface" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">Advertisement proof platform</p>
          <h1 id="home-title">{productName}</h1>
          <p>{businessLabels.customer.servicePromise}</p>
          <p>
            This is the M0 public website placeholder. Enquiry submission starts in M1.
          </p>
        </div>

        <div className="summary-grid" aria-label="Public placeholder sections">
          <span>How It Works</span>
          <span>Packages</span>
          <span>Cities Covered</span>
          <span>{businessLabels.customer.proofReport}</span>
          <span>{businessLabels.customer.contactTeam}</span>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/admin")) {
    return <AdminPlaceholder />;
  }

  return <PublicPlaceholder />;
}
