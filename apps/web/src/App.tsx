import { AdminLeadManagement } from "./admin";
import { LegalPage, isLegalPath } from "./LegalPage";
import { NotFoundPage } from "./NotFoundPage";
import { PublicWebsite } from "./PublicWebsite";
import { resolveProductName } from "@kootha/shared";

const productName = resolveProductName({
  productName: import.meta.env.VITE_PRODUCT_NAME
});

export function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/admin")) {
    return <AdminLeadManagement productName={productName} />;
  }

  if (isLegalPath(pathname)) {
    return <LegalPage pathname={pathname} />;
  }

  if (pathname !== "/") {
    return <NotFoundPage />;
  }

  return <PublicWebsite />;
}
