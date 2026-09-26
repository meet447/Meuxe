import osaCurated from "./marketplaceOsaCurated.json";

export type MarketplaceModelType = "live2d" | "vrm";

export type MarketplaceListing = {
  id: string;
  name: string;
  type: MarketplaceModelType;
  description: string;
  author: string;
  license: string;
  tags: string[];
  /** Direct HTTPS VRM download (installable) */
  downloadUrl?: string;
  thumbnailUrl?: string;
  /** External page for license/download (Live2D samples) */
  sourceUrl?: string;
  /** Ships with the app */
  bundled?: boolean;
  collection?: string;
};

export type MarketplaceListingStatus = MarketplaceListing & {
  installed: boolean;
  installable: boolean; // has downloadUrl and not bundled-only
};

const BUNDLED_LISTINGS: MarketplaceListing[] = [
  {
    id: "haru",
    name: "Haru",
    type: "live2d",
    description: "Default Live2D sample bundled with Meuxe.",
    author: "Live2D Inc.",
    license: "Free Material License",
    sourceUrl: "https://www.live2d.com/en/learn/sample/haru/",
    tags: ["live2d", "bundled"],
    bundled: true,
  },
  {
    id: "utsuwa",
    name: "Utsuwa",
    type: "vrm",
    description: "Default VRM companion bundled with Meuxe.",
    author: "Aikeya",
    license: "MIT",
    sourceUrl: "https://github.com/aikeyaorg/aikeya",
    tags: ["vrm", "bundled", "mit"],
    bundled: true,
  },
];

const OSA_CURATED_LISTINGS = osaCurated as MarketplaceListing[];

/** Catalog shown in the marketplace: bundled defaults + installable VRM looks. */
export const MARKETPLACE_LISTINGS: MarketplaceListing[] = [
  ...BUNDLED_LISTINGS,
  ...OSA_CURATED_LISTINGS,
];

/** Listings that only link out (no install / not on disk) stay out of the browse grid. */
export function isMarketplaceBrowseListing(listing: MarketplaceListingStatus): boolean {
  return listing.installed || listing.installable || Boolean(listing.bundled);
}

export function mergeMarketplaceWithInstalled(
  listings: MarketplaceListing[],
  installedModels: Array<{ id: string; type: string }> | Set<string> | string[],
): MarketplaceListingStatus[] {
  let installedIds: Set<string>;
  let localExtras: Array<{ id: string; type: string }> = [];

  if (installedModels instanceof Set) {
    installedIds = installedModels;
  } else if (
    Array.isArray(installedModels) &&
    installedModels.length > 0 &&
    typeof installedModels[0] === "object"
  ) {
    const models = installedModels as Array<{ id: string; type: string }>;
    installedIds = new Set(models.map((m) => m.id));
    localExtras = models;
  } else {
    installedIds = new Set(installedModels as string[]);
  }

  const knownIds = new Set(listings.map((listing) => listing.id));
  const merged: MarketplaceListingStatus[] = listings.map((listing) => {
    const installed = installedIds.has(listing.id);
    return {
      ...listing,
      installed,
      installable: Boolean(listing.downloadUrl) && !listing.bundled && !installed,
    };
  });

  for (const model of localExtras) {
    if (knownIds.has(model.id)) continue;
    const type = model.type === "vrm" ? "vrm" : "live2d";
    merged.push({
      id: model.id,
      name: displayNameForModelId(model.id),
      type,
      description: "Installed on this device.",
      author: "Local import",
      license: "Your files",
      tags: [type, "installed", "local"],
      installed: true,
      installable: false,
    });
  }

  return merged;
}

function listingHaystack(listing: MarketplaceListingStatus): string {
  return [
    listing.name,
    listing.author,
    listing.description,
    listing.license,
    listing.collection ?? "",
    listing.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterMarketplaceListings(
  items: MarketplaceListingStatus[],
  query: string,
  typeFilter: "all" | "live2d" | "vrm",
): MarketplaceListingStatus[] {
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (!q) return true;
    return listingHaystack(item).includes(q);
  });
}

export function displayNameForModelId(id: string): string {
  const listing = MARKETPLACE_LISTINGS.find((entry) => entry.id === id);
  if (listing) return listing.name;

  if (id.startsWith("osa-")) {
    const rest = id.slice(4);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }

  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function lookLabelForModelId(id: string, installedType?: string): string {
  if (!id) return "Default look";
  const listing = MARKETPLACE_LISTINGS.find((l) => l.id === id);
  const type = listing?.type ?? installedType;
  const typeLabel = type === "vrm" ? "VRM" : type === "live2d" ? "Live2D" : null;
  return typeLabel ? `${displayNameForModelId(id)} · ${typeLabel}` : displayNameForModelId(id);
}
