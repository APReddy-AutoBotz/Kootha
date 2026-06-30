export const DEFAULT_PRODUCT_NAME = "Prachar";
export const SUPPORTED_PRODUCT_NAMES = ["Prachar", "Kootha"] as const;

export type SupportedProductName = (typeof SUPPORTED_PRODUCT_NAMES)[number];

export interface ProductConfig {
  productName?: string | null;
}

export function resolveProductName(config: ProductConfig = {}): SupportedProductName {
  const requestedName = config.productName?.trim();

  if (!requestedName) {
    return DEFAULT_PRODUCT_NAME;
  }

  const normalizedName = requestedName.toLowerCase();
  if (normalizedName === "kootha") {
    return "Kootha";
  }

  return "Prachar";
}
