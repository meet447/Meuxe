import { useEffect, useMemo, useState } from "react";
import { installMarketplaceModel } from "../../api/tauri";
import {
  filterMarketplaceListings,
  isMarketplaceBrowseListing,
  MARKETPLACE_LISTINGS,
  mergeMarketplaceWithInstalled,
  type MarketplaceListingStatus,
} from "../../lib/marketplaceCatalog";
import { openExternalUrl } from "../../lib/openExternal";
import {
  Button,
  CheckIcon,
  cn,
  ExternalIcon,
  Field,
  Input,
  Notice,
  Pill,
  SearchIcon,
  Surface,
  UploadIcon,
} from "../ui";

export interface ModelMarketplaceProps {
  installedModels: {
    id: string;
    type: string;
    path: string;
    animations?: { name: string; path: string }[];
  }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onInstalled: (model: { id: string }) => void | Promise<void>;
  onImportLive2D?: () => void | Promise<void>;
  onImportVRM?: () => void | Promise<void>;
  importing?: null | "live2d" | "vrm";
  compact?: boolean;
}

function typeLabel(type: string) {
  return type === "vrm" ? "VRM" : "Live2D";
}

function ListingThumbnail({
  url,
  type,
  bundled,
}: {
  url?: string;
  type: string;
  bundled?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-3">
        <span className="text-xs font-semibold uppercase tracking-wide">{typeLabel(type)}</span>
        {bundled && (
          <Pill tone="accent" size="xs">
            Bundled
          </Pill>
        )}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ListingCard({
  listing,
  selected,
  compact,
  installing,
  onSelect,
  onInstall,
  onGetModel,
}: {
  listing: MarketplaceListingStatus;
  selected: boolean;
  compact?: boolean;
  installing: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onGetModel: () => void;
}) {
  const showUse = listing.installed || Boolean(listing.bundled);
  const showInstall = !listing.installed && listing.installable;
  const showGetModel = !showUse && Boolean(listing.sourceUrl) && !listing.downloadUrl;

  return (
    <Surface
      as="article"
      tone="surface"
      elevation="soft"
      interactive
      className={cn(
        "flex h-full flex-col overflow-hidden transition-all duration-150",
        selected && "bg-accent-100 ring-2 ring-accent-300/70",
        compact ? "p-3" : "p-3.5",
        showUse && "cursor-pointer",
      )}
      onClick={showUse ? onSelect : undefined}
      onKeyDown={
        showUse
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      role={showUse ? "button" : undefined}
      tabIndex={showUse ? 0 : undefined}
    >
      <div
        className={cn(
          "mb-3 overflow-hidden rounded-field bg-well",
          compact ? "aspect-[4/3]" : "aspect-[5/4]",
        )}
      >
        <ListingThumbnail url={listing.thumbnailUrl} type={listing.type} bundled={listing.bundled} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{listing.name}</h3>
          <Pill tone={listing.type === "vrm" ? "peach" : "accent"} size="xs">
            {typeLabel(listing.type)}
          </Pill>
        </div>

        {!compact && <p className="text-[11px] text-ink-3">{listing.license}</p>}

        <p
          className={cn(
            "text-xs leading-relaxed text-ink-2",
            compact ? "line-clamp-1" : "line-clamp-2",
          )}
        >
          {listing.description}
        </p>

        {!compact && <p className="text-xs text-ink-3">{listing.author}</p>}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {showUse && (
            <Button
              variant={selected ? "soft" : "primary"}
              size="sm"
              className="flex-1"
              leading={selected ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.4} /> : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
            >
              {selected ? "Selected" : "Use"}
            </Button>
          )}
          {showInstall && (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              loading={installing}
              onClick={(event) => {
                event.stopPropagation();
                onInstall();
              }}
            >
              Install
            </Button>
          )}
          {showGetModel && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              trailing={<ExternalIcon className="h-3.5 w-3.5" />}
              onClick={(event) => {
                event.stopPropagation();
                onGetModel();
              }}
            >
              Get model
            </Button>
          )}
        </div>
      </div>
    </Surface>
  );
}

export function ModelMarketplace({
  installedModels,
  selectedId,
  onSelect,
  onInstalled,
  onImportLive2D,
  onImportVRM,
  importing = null,
  compact = false,
}: ModelMarketplaceProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "live2d" | "vrm">("all");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listings = useMemo(() => {
    const merged = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, installedModels);
    return filterMarketplaceListings(merged, query, typeFilter).filter(isMarketplaceBrowseListing);
  }, [installedModels, query, typeFilter]);

  const handleInstall = async (listing: MarketplaceListingStatus) => {
    if (!listing.downloadUrl) return;
    setInstallingId(listing.id);
    setError(null);
    setNotice(null);
    try {
      await installMarketplaceModel(listing.id, listing.downloadUrl);
      await onInstalled({ id: listing.id });
      setNotice(`${listing.name} installed.`);
      onSelect(listing.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingId(null);
    }
  };

  const typeFilters: { id: "all" | "live2d" | "vrm"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "live2d", label: "Live2D" },
    { id: "vrm", label: "VRM" },
  ];

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label={compact ? undefined : "Search models"} className="min-w-0 flex-1">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, author, or tag…"
              className="pl-10"
              aria-label={compact ? "Search models" : undefined}
            />
          </div>
        </Field>

        <div className="flex flex-wrap gap-2">
          {typeFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setTypeFilter(filter.id)}
              className="rounded-full"
            >
              <Pill
                tone={typeFilter === filter.id ? "accent" : "neutral"}
                className={cn(
                  "cursor-pointer transition-opacity",
                  typeFilter !== filter.id && "hover:opacity-80",
                )}
              >
                {filter.label}
              </Pill>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Notice tone="danger" title="Install failed">
          {error}
        </Notice>
      )}

      {notice && (
        <Notice tone="success" title="Installed">
          {notice}
        </Notice>
      )}

      {listings.length === 0 ? (
        <Notice tone="neutral">No models match your search.</Notice>
      ) : (
        <div
          className={cn(
            "grid gap-3 motion-safe:animate-rise-in",
            compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3",
          )}
        >
          {listings.map((listing, index) => (
            <div
              key={listing.id}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <ListingCard
                listing={listing}
                selected={selectedId === listing.id}
                compact={compact}
                installing={installingId === listing.id}
                onSelect={() => onSelect(listing.id)}
                onInstall={() => handleInstall(listing)}
                onGetModel={() => {
                  if (listing.sourceUrl) openExternalUrl(listing.sourceUrl);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <Notice tone="info">
        {compact ? (
          <>
            Free VRM looks from{" "}
            <button
              type="button"
              className="font-semibold underline decoration-accent-300 underline-offset-2 hover:text-ink"
              onClick={() => openExternalUrl("https://opensourceavatars.com")}
            >
              Open Source Avatars
            </button>{" "}
            (CC0) install in one click.
          </>
        ) : (
          <>
            Free VRM looks from{" "}
            <button
              type="button"
              className="font-semibold underline decoration-accent-300 underline-offset-2 hover:text-ink"
              onClick={() => openExternalUrl("https://opensourceavatars.com")}
            >
              Open Source Avatars
            </button>{" "}
            (CC0) install in one click. Import your own Live2D or VRM files below.
          </>
        )}
      </Notice>

      {(onImportLive2D || onImportVRM) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {onImportLive2D && (
            <Button
              variant="ghost"
              size="sm"
              leading={<UploadIcon className="h-4 w-4" />}
              loading={importing === "live2d"}
              onClick={() => onImportLive2D()}
            >
              Import Live2D
            </Button>
          )}
          {onImportVRM && (
            <Button
              variant="ghost"
              size="sm"
              leading={<UploadIcon className="h-4 w-4" />}
              loading={importing === "vrm"}
              onClick={() => onImportVRM()}
            >
              Import VRM
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
