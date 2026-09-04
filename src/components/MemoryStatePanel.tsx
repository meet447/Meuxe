import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMemory,
  searchMemory,
  clearMemory,
  clearChat,
  getMemoryOverview,
  rebuildMemoryVault,
  runMemoryDream,
  migrateLegacyMemory,
  deleteMemory,
  setMemoryPinned,
  getMemorySources,
  getMemoryTopics,
  ingestMemoryNote,
  ingestMemoryTranscript,
  ingestMemoryFileDialog,
  ingestMemoryFolderDialog,
  exportMemoryZipDialog,
  importMemoryZipDialog,
} from "../api/tauri";
import type {
  DreamRun,
  MemoryRecord,
  MemorySourceRecord,
  MemoryVaultOverview,
  TopicSummary,
} from "../types";
import {
  Button,
  Dots,
  DownloadIcon,
  Field,
  IconButton,
  Input,
  Mascot,
  MoonIcon,
  Notice,
  Pill,
  PinIcon,
  RefreshIcon,
  SearchIcon,
  Textarea,
  TrashIcon,
  UploadIcon,
} from "./ui";

interface Props {
  characterId?: string;
  characterName: string;
  onConversationCleared?: () => void;
}

const sectionCardClass = "squircle rounded-card bg-surface-2 p-5 shadow-soft";

type MemoryTab = "overview" | "search" | "timeline" | "sources" | "vault";

const TAB_LABELS: Record<MemoryTab, string> = {
  overview: "Overview",
  search: "Search",
  timeline: "Timeline",
  sources: "Sources",
  vault: "Vault",
};

function statusNoticeTone(message: string): "info" | "success" {
  const lower = message.toLowerCase();
  if (
    lower.includes("completed") ||
    lower.includes("imported") ||
    lower.includes("exported") ||
    lower.includes("migrated") ||
    lower.includes("rebuilt")
  ) {
    return "success";
  }
  return "info";
}

export function MemoryStatePanel({ characterId, characterName, onConversationCleared }: Props) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [overview, setOverview] = useState<MemoryVaultOverview | null>(null);
  const [sources, setSources] = useState<MemorySourceRecord[]>([]);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [transcriptTitle, setTranscriptTitle] = useState("");
  const [transcriptBody, setTranscriptBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryTab>("overview");
  const [lastDream, setLastDream] = useState<DreamRun | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [busyAction, setBusyAction] = useState<
    null | "memories" | "conversation" | "dream" | "rebuild" | "ingest" | "export"
  >(null);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const [memoryData, overviewData, sourceData, topicData] = await Promise.all([
        getMemory(characterId),
        getMemoryOverview(characterId).catch(() => null),
        getMemorySources(characterId).catch(() => []),
        getMemoryTopics(characterId).catch(() => []),
      ]);
      const mems = (memoryData as MemoryRecord[]) || [];
      setMemories(mems);
      setOverview((overviewData as MemoryVaultOverview | null) || null);
      setSources((sourceData as MemorySourceRecord[]) || []);
      setTopics((topicData as TopicSummary[]) || []);
      setResults([]);
    } catch (err) {
      console.error("Memory panel refresh error:", err);
      setMemories([]);
      setResults([]);
      setOverview(null);
      setSources([]);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSearch = useCallback(async () => {
    if (!characterId || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await searchMemory(characterId, query.trim());
      setResults((data as MemoryRecord[]) || []);
    } catch (err) {
      console.error("Memory search error:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [characterId, query]);

  const clearMemories = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("memories");
    try {
      await clearMemory(characterId);
      await refresh();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const clearConversation = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("conversation");
    try {
      await clearChat(characterId);
      await onConversationCleared?.();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, onConversationCleared]);

  const groupedMemoryLabel = useMemo(() => {
    const counts = memories.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} ${count}`)
      .join(" \u00B7 ");
  }, [memories]);

  const reflections = useMemo(
    () => memories.filter((memory) => memory.type === "reflections").slice(0, 8),
    [memories],
  );

  const recentTimeline = useMemo(
    () =>
      [...memories]
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 16),
    [memories],
  );

  const runDream = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("dream");
    setStatusMessage("");
    try {
      const dream = (await runMemoryDream(characterId)) as DreamRun;
      setLastDream(dream);
      setStatusMessage("Dream/reflection completed and written to the vault.");
      await refresh();
    } catch (err) {
      console.error("Dream run error:", err);
      setStatusMessage("Dream/reflection failed. Check logs for details.");
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const rebuildVault = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("rebuild");
    setStatusMessage("");
    try {
      const path = await rebuildMemoryVault(characterId);
      setStatusMessage(`Vault rebuilt at ${path}`);
      await refresh();
    } catch (err) {
      console.error("Vault rebuild error:", err);
      setStatusMessage("Vault rebuild failed. Check logs for details.");
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const handleMemoryDelete = useCallback(
    async (memoryId: string) => {
      if (!characterId) return;
      await deleteMemory(characterId, memoryId);
      await refresh();
    },
    [characterId, refresh],
  );

  const handleMemoryPin = useCallback(
    async (memoryId: string, pinned: boolean) => {
      if (!characterId) return;
      await setMemoryPinned(characterId, memoryId, pinned);
      await refresh();
    },
    [characterId, refresh],
  );

  const ingestNote = useCallback(async () => {
    if (!characterId || !noteTitle.trim() || !noteBody.trim()) return;
    setBusyAction("ingest");
    try {
      const count = await ingestMemoryNote(characterId, noteTitle.trim(), noteBody.trim());
      setStatusMessage(`Imported note with ${count} memory entr${count === 1 ? "y" : "ies"}.`);
      setNoteTitle("");
      setNoteBody("");
      await refresh();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, noteBody, noteTitle, refresh]);

  const ingestTranscript = useCallback(async () => {
    if (!characterId || !transcriptTitle.trim() || !transcriptBody.trim()) return;
    setBusyAction("ingest");
    try {
      const count = await ingestMemoryTranscript(
        characterId,
        transcriptTitle.trim(),
        transcriptBody.trim(),
      );
      setStatusMessage(`Imported transcript with ${count} memory entr${count === 1 ? "y" : "ies"}.`);
      setTranscriptTitle("");
      setTranscriptBody("");
      await refresh();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, transcriptBody, transcriptTitle, refresh]);

  const ingestFile = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("ingest");
    try {
      const count = await ingestMemoryFileDialog(characterId);
      if (count !== null) {
        setStatusMessage(`Imported file with ${count} memory entr${count === 1 ? "y" : "ies"}.`);
        await refresh();
      }
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const ingestFolder = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("ingest");
    try {
      const count = await ingestMemoryFolderDialog(characterId);
      if (count !== null) {
        setStatusMessage(`Imported folder with ${count} memory entr${count === 1 ? "y" : "ies"}.`);
        await refresh();
      }
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const migrateLegacy = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("ingest");
    try {
      const count = await migrateLegacyMemory(characterId);
      setStatusMessage(`Migrated ${count} legacy memory entr${count === 1 ? "y" : "ies"} into SQLite.`);
      await refresh();
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  const exportZip = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("export");
    try {
      const path = await exportMemoryZipDialog(characterId);
      if (path) setStatusMessage(`Exported vault zip to ${path}`);
    } finally {
      setBusyAction(null);
    }
  }, [characterId]);

  const importZip = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("export");
    try {
      const count = await importMemoryZipDialog(characterId);
      if (count !== null) {
        setStatusMessage(`Imported zip with ${count} memory entr${count === 1 ? "y" : "ies"}.`);
        await refresh();
      }
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  if (!characterId) {
    return <p className="text-sm text-ink-3">Select a character to inspect memory.</p>;
  }

  return (
    <div className="space-y-5">
      <div className={sectionCardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-ink-3">Memory vault</p>
            <h3 className="mt-1 text-sm font-semibold text-ink">{characterName}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
              Inspect the local memory database, Markdown vault, relationship state, and background reflections.
            </p>
          </div>
          <Button variant="secondary" size="sm" loading={loading} onClick={refresh}>
            Refresh
          </Button>
        </div>
        {groupedMemoryLabel && (
          <p className="mt-4 rounded-card bg-surface px-4 py-3 text-xs text-ink-3">{groupedMemoryLabel}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric label="Memories" value={overview?.total_memories ?? memories.length} />
          <Metric label="Sources" value={overview?.total_sources ?? 0} />
          <Metric label="Dreams" value={overview?.total_dreams ?? 0} />
          <Metric label="Topics" value={overview?.topic_count ?? topics.length} />
          <Metric label="Pinned" value={overview?.pinned_count ?? memories.filter((m) => m.pinned).length} />
          <Metric label="Mood" value={overview?.relationship?.mood || "neutral"} />
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-full bg-well p-1">
        {(["overview", "search", "timeline", "sources", "vault"] as MemoryTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              activeTab === tab
                ? "bg-surface-2 text-ink shadow-soft"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {statusMessage && (
        <Notice tone={statusNoticeTone(statusMessage)}>{statusMessage}</Notice>
      )}

      {loading && memories.length === 0 && (
        <div className="flex items-center gap-2 py-4">
          <Dots />
          <span className="text-sm text-ink-3">Loading memories…</span>
        </div>
      )}

      <div className="space-y-5">
        {activeTab === "overview" && (
          <>
            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Relationship state</h4>
              <p className="mt-1 text-xs text-ink-3">Prompt-aware companion context</p>
              {overview?.relationship ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Metric label="Trust" value={`${Math.round(overview.relationship.trust * 100)}%`} />
                  <Metric label="Affection" value={`${Math.round(overview.relationship.affection * 100)}%`} />
                  <Metric label="Energy" value={`${Math.round(overview.relationship.energy * 100)}%`} />
                  <Metric label="Mood" value={overview.relationship.mood} />
                  <div className="rounded-card bg-surface px-4 py-3 md:col-span-4">
                    <p className="text-xs text-ink-3">Summary</p>
                    <p className="mt-2 text-sm text-ink-2">{overview.relationship.relationship_summary}</p>
                  </div>
                </div>
              ) : (
                <EmptyState text="No relationship state yet. Chat with the companion to start building it." />
              )}
            </section>

            <section className={sectionCardClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Background dream</h4>
                  <p className="mt-1 text-xs text-ink-3">Reflect and consolidate</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    Dream runs turn recent memories into reflections and update the Markdown vault.
                  </p>
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  leading={<MoonIcon className="h-4 w-4" />}
                  loading={busyAction === "dream"}
                  disabled={busyAction !== null && busyAction !== "dream"}
                  onClick={runDream}
                >
                  Run dream
                </Button>
              </div>
              <p className="mt-4 rounded-card bg-surface px-4 py-3 text-sm text-ink-2">
                {lastDream?.summary || "No manual dream run in this panel yet."}
              </p>
            </section>

            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Reflections</h4>
              <p className="mt-1 text-xs text-ink-3">Recent long-horizon notes</p>
              <div className="mt-4">
                <MemoryList
                  memories={reflections}
                  emptyText="No reflections yet. Run a dream after a few meaningful conversations."
                  onDelete={handleMemoryDelete}
                  onPin={handleMemoryPin}
                />
              </div>
            </section>
          </>
        )}

        {activeTab === "search" && (
          <section className={sectionCardClass}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-ink">Memory search</h4>
                <p className="mt-1 text-xs text-ink-3">Probe the local archive</p>
              </div>
              <Pill size="xs">{memories.length} entries</Pill>
            </div>

            <div className="flex gap-2">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for preferences, facts..."
                className="flex-1"
              />
              <Button
                variant="soft"
                leading={<SearchIcon className="h-4 w-4" />}
                loading={searching}
                onClick={handleSearch}
              >
                Search
              </Button>
            </div>

            {results.length > 0 && (
              <div className="mt-4 space-y-3">
                {results.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    accent
                    onDelete={handleMemoryDelete}
                    onPin={handleMemoryPin}
                  />
                ))}
              </div>
            )}

            <div className="mt-5">
              <MemoryList
                memories={memories.slice(0, 12)}
                emptyText="No long-term memories stored yet. Start chatting and the companion will begin writing memories locally."
                onDelete={handleMemoryDelete}
                onPin={handleMemoryPin}
              />
            </div>

            <Button
              variant="danger-soft"
              fullWidth
              className="mt-5"
              loading={busyAction === "memories"}
              disabled={busyAction !== null && busyAction !== "memories"}
              onClick={clearMemories}
            >
              Clear memories
            </Button>
          </section>
        )}

        {activeTab === "timeline" && (
          <section className={sectionCardClass}>
            <h4 className="text-sm font-semibold text-ink">Timeline</h4>
            <p className="mt-1 text-xs text-ink-3">Recent memory writes</p>
            <div className="mt-4">
              <MemoryList
                memories={recentTimeline}
                emptyText="No memory timeline yet."
                onDelete={handleMemoryDelete}
                onPin={handleMemoryPin}
              />
            </div>
          </section>
        )}

        {activeTab === "sources" && (
          <>
            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Local source ingestion</h4>
              <p className="mt-1 text-xs text-ink-3">Notes, transcripts, and folders</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Note title">
                    <Input
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Note title"
                    />
                  </Field>
                  <Field label="Note body">
                    <Textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Markdown or text note..."
                      rows={6}
                    />
                  </Field>
                  <Button
                    variant="primary"
                    loading={busyAction === "ingest"}
                    disabled={busyAction !== null && busyAction !== "ingest"}
                    onClick={ingestNote}
                  >
                    Import note
                  </Button>
                </div>
                <div className="space-y-3">
                  <Field label="Meeting title">
                    <Input
                      value={transcriptTitle}
                      onChange={(e) => setTranscriptTitle(e.target.value)}
                      placeholder="Meeting title"
                    />
                  </Field>
                  <Field label="Transcript">
                    <Textarea
                      value={transcriptBody}
                      onChange={(e) => setTranscriptBody(e.target.value)}
                      placeholder="Meeting transcript..."
                      rows={6}
                    />
                  </Field>
                  <Button
                    variant="primary"
                    loading={busyAction === "ingest"}
                    disabled={busyAction !== null && busyAction !== "ingest"}
                    onClick={ingestTranscript}
                  >
                    Import transcript
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Button
                  variant="secondary"
                  leading={<UploadIcon className="h-4 w-4" />}
                  loading={busyAction === "ingest"}
                  disabled={busyAction !== null && busyAction !== "ingest"}
                  onClick={ingestFile}
                >
                  Import file
                </Button>
                <Button
                  variant="secondary"
                  leading={<UploadIcon className="h-4 w-4" />}
                  loading={busyAction === "ingest"}
                  disabled={busyAction !== null && busyAction !== "ingest"}
                  onClick={ingestFolder}
                >
                  Import folder
                </Button>
                <Button
                  variant="secondary"
                  loading={busyAction === "ingest"}
                  disabled={busyAction !== null && busyAction !== "ingest"}
                  onClick={migrateLegacy}
                >
                  Migrate JSONL
                </Button>
              </div>
            </section>

            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Source provenance</h4>
              <p className="mt-1 text-xs text-ink-3">Recent ingested sources</p>
              <div className="mt-4 space-y-3">
                {sources.length === 0 ? (
                  <EmptyState text="No ingested sources yet." />
                ) : (
                  sources.map((source) => (
                    <div key={source.id} className="rounded-card bg-surface px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">{source.title}</span>
                        <span className="text-xs text-ink-3">{new Date(source.ts).toLocaleString()}</span>
                      </div>
                      <Pill size="xs" className="mt-2">
                        {source.source_kind}
                      </Pill>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Topics</h4>
              <p className="mt-1 text-xs text-ink-3">Derived topic summaries</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {topics.length === 0 ? (
                  <EmptyState text="No topics yet." />
                ) : (
                  topics.map((topic) => (
                    <div key={topic.topic} className="rounded-card bg-surface px-4 py-3">
                      <div className="text-sm font-semibold text-ink">{topic.topic}</div>
                      <div className="mt-1 text-xs text-ink-3">{topic.count} memories</div>
                      <p className="mt-2 text-sm text-ink-2">{topic.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "vault" && (
          <>
            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Markdown vault</h4>
              <p className="mt-1 text-xs text-ink-3">Local readable projection</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                The SQLite database is canonical. The Markdown vault is rebuilt from it for browsing, backups, and
                Obsidian-style workflows.
              </p>
              <div className="mt-4 space-y-3 rounded-card bg-surface px-4 py-4">
                <PathRow label="Vault folder" value={overview?.vault_path || "Not built yet"} />
                <PathRow label="Database" value={overview?.database_path || "Not initialized yet"} />
                <PathRow label="Latest memory" value={overview?.latest_memory_at || "none"} />
                <PathRow label="Latest dream" value={overview?.latest_dream_at || "none"} />
              </div>
              <Button
                variant="soft"
                fullWidth
                className="mt-5"
                leading={<RefreshIcon className="h-4 w-4" />}
                loading={busyAction === "rebuild"}
                disabled={busyAction !== null && busyAction !== "rebuild"}
                onClick={rebuildVault}
              >
                Rebuild vault
              </Button>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Button
                  variant="secondary"
                  leading={<DownloadIcon className="h-4 w-4" />}
                  loading={busyAction === "export"}
                  disabled={busyAction !== null && busyAction !== "export"}
                  onClick={exportZip}
                >
                  Export zip
                </Button>
                <Button
                  variant="secondary"
                  leading={<UploadIcon className="h-4 w-4" />}
                  loading={busyAction === "export"}
                  disabled={busyAction !== null && busyAction !== "export"}
                  onClick={importZip}
                >
                  Import zip
                </Button>
              </div>
            </section>

            <section className={sectionCardClass}>
              <h4 className="text-sm font-semibold text-ink">Conversation archive</h4>
              <p className="mt-1 text-xs text-ink-3">Session control</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Clear chat history to restart the conversation without deleting long-term memories.
              </p>
              <Button
                variant="danger-soft"
                fullWidth
                className="mt-4"
                loading={busyAction === "conversation"}
                disabled={busyAction !== null && busyAction !== "conversation"}
                onClick={clearConversation}
              >
                Clear conversation
              </Button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card bg-surface px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Mascot mood="sleepy" className="h-12 w-12" />
      <p className="text-sm text-ink-3">{text}</p>
    </div>
  );
}

function MemoryList({
  memories,
  emptyText,
  onDelete,
  onPin,
}: {
  memories: MemoryRecord[];
  emptyText: string;
  onDelete?: (memoryId: string) => void | Promise<void>;
  onPin?: (memoryId: string, pinned: boolean) => void | Promise<void>;
}) {
  if (memories.length === 0) {
    return <EmptyState text={emptyText} />;
  }
  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} onDelete={onDelete} onPin={onPin} />
      ))}
    </div>
  );
}

function MemoryCard({
  memory,
  accent = false,
  onDelete,
  onPin,
}: {
  memory: MemoryRecord;
  accent?: boolean;
  onDelete?: (memoryId: string) => void | Promise<void>;
  onPin?: (memoryId: string, pinned: boolean) => void | Promise<void>;
}) {
  return (
    <div className={`rounded-card bg-surface px-4 py-3 ${accent ? "ring-1 ring-accent-200/60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <Pill tone={memory.pinned ? "accent" : "neutral"} size="xs">
          {memory.type}
        </Pill>
        <span className="text-xs text-ink-3">{new Date(memory.ts).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{memory.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill size="xs">importance {Math.round(memory.importance * 100)}%</Pill>
        {memory.source_kind && <Pill size="xs">{memory.source_kind}</Pill>}
        {memory.topic && <Pill size="xs">topic {memory.topic}</Pill>}
        {memory.tags?.slice(0, 6).map((tag) => (
          <Pill key={`${memory.id}-${tag}`} size="xs">
            {tag}
          </Pill>
        ))}
      </div>
      {(onDelete || onPin) && (
        <div className="mt-3 flex gap-1">
          {onPin && (
            <IconButton
              label={memory.pinned ? "Unpin" : "Pin"}
              size="sm"
              variant="ghost"
              active={memory.pinned}
              onClick={() => void onPin(memory.id, !memory.pinned)}
            >
              <PinIcon className="h-4 w-4" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              label="Forget"
              size="sm"
              variant="ghost"
              onClick={() => void onDelete(memory.id)}
            >
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 break-all font-mono text-xs text-ink-2">{value}</div>
    </div>
  );
}
