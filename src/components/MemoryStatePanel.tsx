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

interface Props {
  characterId?: string;
  characterName: string;
  onConversationCleared?: () => void;
}

const sectionCardClass =
  "rounded-[1.75rem] border border-slate-200/70 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]";

type MemoryTab = "overview" | "search" | "timeline" | "sources" | "vault";

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
  const [busyAction, setBusyAction] = useState<null | "memories" | "conversation" | "dream" | "rebuild" | "ingest" | "export" >(null);

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
    [memories]
  );

  const recentTimeline = useMemo(
    () =>
      [...memories]
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 16),
    [memories]
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

  const handleMemoryDelete = useCallback(async (memoryId: string) => {
    if (!characterId) return;
    await deleteMemory(characterId, memoryId);
    await refresh();
  }, [characterId, refresh]);

  const handleMemoryPin = useCallback(async (memoryId: string, pinned: boolean) => {
    if (!characterId) return;
    await setMemoryPinned(characterId, memoryId, pinned);
    await refresh();
  }, [characterId, refresh]);

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
      const count = await ingestMemoryTranscript(characterId, transcriptTitle.trim(), transcriptBody.trim());
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
    return (
      <div className="p-6 text-sm text-slate-400">
        Select a character to inspect memory.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Memory Vault</div>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{characterName}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Inspect the local memory database, Markdown vault, relationship state, and background reflections.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-full border border-white/90 bg-white/90 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        {groupedMemoryLabel && (
          <div className="mt-5 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-xs font-medium text-slate-500 shadow-sm">
            {groupedMemoryLabel}
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric label="Memories" value={overview?.total_memories ?? memories.length} />
          <Metric label="Sources" value={overview?.total_sources ?? 0} />
          <Metric label="Dreams" value={overview?.total_dreams ?? 0} />
          <Metric label="Topics" value={overview?.topic_count ?? topics.length} />
          <Metric label="Pinned" value={overview?.pinned_count ?? memories.filter((m) => m.pinned).length} />
          <Metric label="Mood" value={overview?.relationship?.mood || "neutral"} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["overview", "search", "timeline", "sources", "vault"] as MemoryTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all ${
              activeTab === tab
                ? "bg-slate-900 text-white shadow-md"
                : "border border-slate-200 bg-white text-slate-500 hover:-translate-y-0.5 hover:shadow-sm"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {statusMessage}
        </div>
      )}

      <div className="space-y-5">
        {activeTab === "overview" && (
          <>
            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Relationship State</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Prompt-aware companion context</h4>
              </div>
              {overview?.relationship ? (
                <div className="grid gap-3 md:grid-cols-4">
                  <Metric label="Trust" value={`${Math.round(overview.relationship.trust * 100)}%`} />
                  <Metric label="Affection" value={`${Math.round(overview.relationship.affection * 100)}%`} />
                  <Metric label="Energy" value={`${Math.round(overview.relationship.energy * 100)}%`} />
                  <Metric label="Mood" value={overview.relationship.mood} />
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 md:col-span-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Summary</div>
                    <p className="mt-2 text-sm text-slate-600">{overview.relationship.relationship_summary}</p>
                  </div>
                </div>
              ) : (
                <EmptyState text="No relationship state yet. Chat with the companion to start building it." />
              )}
            </section>

            <section className={sectionCardClass}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Background Dream</div>
                  <h4 className="mt-2 text-lg font-bold text-slate-800">Reflect and consolidate</h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Dream runs turn recent memories into reflections and update the Markdown vault.
                  </p>
                </div>
                <button
                  onClick={runDream}
                  disabled={busyAction !== null}
                  className="rounded-2xl bg-indigo-600 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyAction === "dream" ? "Dreaming" : "Run Dream"}
                </button>
              </div>
              <p className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-700">
                {lastDream?.summary || "No manual dream run in this panel yet."}
              </p>
            </section>

            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Reflections</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Recent long-horizon notes</h4>
              </div>
              <MemoryList memories={reflections} emptyText="No reflections yet. Run a dream after a few meaningful conversations." onDelete={handleMemoryDelete} onPin={handleMemoryPin} />
            </section>
          </>
        )}

        {activeTab === "search" && (
          <section className={sectionCardClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Memory Search</div>
              <h4 className="mt-2 text-lg font-bold text-slate-800">Probe the local archive</h4>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {memories.length} entries
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for preferences, facts..."
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="rounded-2xl bg-slate-800 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white transition-all hover:-translate-y-0.5 hover:bg-slate-900"
            >
              {searching ? "Searching" : "Search"}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              {results.map((memory) => (
                <MemoryCard key={memory.id} memory={memory} accent onDelete={handleMemoryDelete} onPin={handleMemoryPin} />
              ))}
            </div>
          )}

          <div className="mt-5">
            <MemoryList memories={memories.slice(0, 12)} emptyText="No long-term memories stored yet. Start chatting and the companion will begin writing memories locally." onDelete={handleMemoryDelete} onPin={handleMemoryPin} />
          </div>

          <button
            onClick={clearMemories}
            disabled={busyAction !== null}
            className="mt-5 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-50"
          >
            {busyAction === "memories" ? "Clearing Memories..." : "Clear Memories"}
          </button>
        </section>
        )}

        {activeTab === "timeline" && (
          <section className={sectionCardClass}>
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Timeline</div>
              <h4 className="mt-2 text-lg font-bold text-slate-800">Recent memory writes</h4>
            </div>
            <MemoryList memories={recentTimeline} emptyText="No memory timeline yet." onDelete={handleMemoryDelete} onPin={handleMemoryPin} />
          </section>
        )}

        {activeTab === "sources" && (
          <>
            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Local Source Ingestion</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Notes, transcripts, and folders</h4>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white" />
                  <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Markdown or text note..." rows={6} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white" />
                  <button onClick={ingestNote} disabled={busyAction !== null} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-50">Import Note</button>
                </div>
                <div className="space-y-3">
                  <input value={transcriptTitle} onChange={(e) => setTranscriptTitle(e.target.value)} placeholder="Meeting title" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white" />
                  <textarea value={transcriptBody} onChange={(e) => setTranscriptBody(e.target.value)} placeholder="Meeting transcript..." rows={6} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white" />
                  <button onClick={ingestTranscript} disabled={busyAction !== null} className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-50">Import Transcript</button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <button onClick={ingestFile} disabled={busyAction !== null} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 disabled:opacity-50">Import File</button>
                <button onClick={ingestFolder} disabled={busyAction !== null} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 disabled:opacity-50">Import Folder</button>
                <button onClick={migrateLegacy} disabled={busyAction !== null} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 disabled:opacity-50">Migrate JSONL</button>
              </div>
            </section>

            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Source Provenance</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Recent ingested sources</h4>
              </div>
              <div className="space-y-3">
                {sources.length === 0 ? <EmptyState text="No ingested sources yet." /> : sources.map((source) => (
                  <div key={source.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-800">{source.title}</span>
                      <span className="text-[11px] text-slate-400">{new Date(source.ts).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{source.source_kind}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Topics</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Derived topic summaries</h4>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {topics.length === 0 ? <EmptyState text="No topics yet." /> : topics.map((topic) => (
                  <div key={topic.topic} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-bold text-slate-800">{topic.topic}</div>
                    <div className="mt-1 text-xs text-slate-400">{topic.count} memories</div>
                    <p className="mt-2 text-sm text-slate-600">{topic.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "vault" && (
          <>
            <section className={sectionCardClass}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Markdown Vault</div>
                <h4 className="mt-2 text-lg font-bold text-slate-800">Local readable projection</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  The SQLite database is canonical. The Markdown vault is rebuilt from it for browsing, backups, and Obsidian-style workflows.
                </p>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <PathRow label="Vault folder" value={overview?.vault_path || "Not built yet"} />
                <PathRow label="Database" value={overview?.database_path || "Not initialized yet"} />
                <PathRow label="Latest memory" value={overview?.latest_memory_at || "none"} />
                <PathRow label="Latest dream" value={overview?.latest_dream_at || "none"} />
              </div>
              <button
                onClick={rebuildVault}
                disabled={busyAction !== null}
                className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-0.5 hover:bg-black disabled:opacity-50"
              >
                {busyAction === "rebuild" ? "Rebuilding Vault..." : "Rebuild Vault"}
              </button>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <button
                  onClick={exportZip}
                  disabled={busyAction !== null}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-600 disabled:opacity-50"
                >
                  Export Zip
                </button>
                <button
                  onClick={importZip}
                  disabled={busyAction !== null}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-600 disabled:opacity-50"
                >
                  Import Zip
                </button>
              </div>
            </section>

        <section className={`${sectionCardClass} bg-slate-50`}>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Conversation Archive</div>
            <h4 className="mt-2 text-lg font-bold text-slate-800">Session control</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Clear chat history to restart the conversation without deleting long-term memories.
            </p>
          </div>
          <button
            onClick={clearConversation}
            disabled={busyAction !== null}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-0.5 hover:bg-black disabled:opacity-50"
          >
            {busyAction === "conversation" ? "Clearing Conversation..." : "Clear Conversation"}
          </button>
        </section>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
      {text}
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
    <div className={`rounded-[1.45rem] border px-4 py-3 shadow-sm ${
      accent ? "border-blue-100 bg-blue-50/60" : "border-slate-200/80 bg-white"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
          accent ? "text-blue-600" : "text-slate-500"
        }`}>
          {memory.type}
        </span>
        <span className="text-[11px] text-slate-400">{new Date(memory.ts).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{memory.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          importance {Math.round(memory.importance * 100)}%
        </span>
        {memory.source_kind && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {memory.source_kind}
          </span>
        )}
        {memory.topic && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-500">
            topic {memory.topic}
          </span>
        )}
        {memory.tags?.slice(0, 6).map((tag) => (
          <span key={`${memory.id}-${tag}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {tag}
          </span>
        ))}
      </div>
      {(onDelete || onPin) && (
        <div className="mt-3 flex gap-2">
          {onPin && (
            <button
              onClick={() => void onPin(memory.id, !memory.pinned)}
              className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              {memory.pinned ? "Unpin" : "Pin"}
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => void onDelete(memory.id)}
              className="rounded-full border border-rose-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-600"
            >
              Forget
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 break-all font-mono text-xs text-slate-600">{value}</div>
    </div>
  );
}
