import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_LISTINGS,
  displayNameForModelId,
  filterMarketplaceListings,
  isMarketplaceBrowseListing,
  lookLabelForModelId,
  mergeMarketplaceWithInstalled,
} from "./marketplaceCatalog";

describe("mergeMarketplaceWithInstalled", () => {
  it("marks bundled and downloaded models as installed", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, ["haru", "osa-olivia"]);

    expect(statuses.find((s) => s.id === "haru")).toMatchObject({
      installed: true,
      installable: false,
      bundled: true,
    });
    expect(statuses.find((s) => s.id === "osa-olivia")).toMatchObject({
      installed: true,
      installable: false,
    });
  });

  it("appends local-only installed models", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, [
      { id: "haru", type: "live2d" },
      { id: "my-import", type: "vrm" },
    ]);
    expect(statuses.find((s) => s.id === "my-import")).toMatchObject({
      installed: true,
      installable: false,
      type: "vrm",
      author: "Local import",
    });
  });

  it("accepts a Set of installed ids", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, new Set(["utsuwa"]));
    expect(statuses.find((s) => s.id === "utsuwa")?.installed).toBe(true);
  });
});

describe("isMarketplaceBrowseListing", () => {
  it("hides external-only Get model listings", () => {
    const externalOnly = mergeMarketplaceWithInstalled(
      [
        {
          id: "hiyori",
          name: "Hiyori",
          type: "live2d",
          description: "External sample",
          author: "Live2D Inc.",
          license: "Free Material License",
          tags: ["live2d"],
          sourceUrl: "https://www.live2d.com/en/learn/sample/hiyori/",
        },
      ],
      [],
    )[0];

    expect(isMarketplaceBrowseListing(externalOnly)).toBe(false);
  });

  it("keeps bundled, installable, and installed looks", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, ["haru"]);
    expect(statuses.every(isMarketplaceBrowseListing)).toBe(true);
    expect(MARKETPLACE_LISTINGS.some((l) => l.id === "hiyori")).toBe(false);
  });
});

describe("filterMarketplaceListings", () => {
  const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, []);

  it("filters by type", () => {
    const live2d = filterMarketplaceListings(statuses, "", "live2d");
    expect(live2d.every((item) => item.type === "live2d")).toBe(true);
    expect(live2d.some((item) => item.id === "haru")).toBe(true);
    expect(live2d.some((item) => item.id === "osa-olivia")).toBe(false);
  });

  it("matches query across name, author, tags, description, license, and collection", () => {
    expect(filterMarketplaceListings(statuses, "polygonal", "all").map((s) => s.id)).toContain(
      "osa-olivia",
    );
    expect(filterMarketplaceListings(statuses, "cc0", "all").length).toBeGreaterThan(0);
    expect(filterMarketplaceListings(statuses, "100avatars", "all").length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    const lower = filterMarketplaceListings(statuses, "olivia", "all");
    const upper = filterMarketplaceListings(statuses, "OLIVIA", "all");
    expect(lower).toEqual(upper);
  });
});

describe("displayNameForModelId", () => {
  it("returns catalog names when known", () => {
    expect(displayNameForModelId("haru")).toBe("Haru");
    expect(displayNameForModelId("osa-olivia")).toBe("Olivia");
  });

  it("pretty-prints unknown ids", () => {
    expect(displayNameForModelId("osa-mint")).toBe("Mint");
    expect(displayNameForModelId("custom-avatar")).toBe("Custom-avatar");
  });
});

describe("lookLabelForModelId", () => {
  it("includes type labels for known and installed models", () => {
    expect(lookLabelForModelId("haru")).toBe("Haru · Live2D");
    expect(lookLabelForModelId("utsuwa")).toBe("Utsuwa · VRM");
    expect(lookLabelForModelId("")).toBe("Default look");
    expect(lookLabelForModelId("foo", "vrm")).toBe("Foo · VRM");
  });
});
