import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addMemoryFact,
  clearChat,
  forgetMemoryFact,
  forgetMemoryMoment,
  getMemorySnapshot,
  resetMemory,
  updateMemoryFact,
} from "../api/tauri";
import { relativeTime } from "../lib/relativeTime";
import type {
  BondStage,
  MemoryFact,
  MemoryFactKind,
  MemoryMoment,
  MemorySnapshot,
} from "../types";
import {
  Button,
  Dots,
  EditIcon,
  IconButton,
  Input,
  Mascot,
  Notice,
  Pill,
  TrashIcon,
} from "./ui";
import type { MascotMood } from "./ui";

interface Props {
  characterId?: string;
  characterName: string;
  onConversationCleared?: () => void;
}

const sectionCardClass = "squircle rounded-card bg-surface-2 p-5 shadow-soft";

const FACT_KIND_ORDER: MemoryFactKind[] = [
  "identity",
  "people",
  "preference",
  "work",
  "life",
  "boundary",
  "other",
];

const FACT_KIND_HEADINGS: Record<MemoryFactKind, string> = {
  identity: "About you",
  people: "People and pets",
  preference: "Likes and dislikes",
  work: "Work and projects",
  life: "Life",
  boundary: "Boundaries",
  other: "Other",
};

const STAGE_LABELS: Record<BondStage, string> = {
  "just met": "Just met",
  "getting to know each other": "Getting to know each other",
  friends: "Friends",
  close: "Close",
  inseparable: "Inseparable",
};

const HAPPY_MOODS = new Set(["happy", "content", "playful", "excited", "missed you"]);
const THINKING_MOODS = new Set(["worried", "sad", "lonely", "hurt", "disappointed"]);
const SURPRISED_MOODS = new Set(["angry", "annoyed", "upset", "frustrated", "jealous", "cold"]);

function mascotMoodFromBond(snapshot: MemorySnapshot): MascotMood {
  const moodName = snapshot.bond.mood.name.toLowerCase();
  const seconds = snapshot.bond.seconds_since_last_talk ?? null;

  if (moodName === "neutral" && seconds !== null && seconds > 3 * 24 * 3600) {
    return "sleepy";
  }
  if (HAPPY_MOODS.has(moodName)) return "happy";
  if (THINKING_MOODS.has(moodName)) return "thinking";
  if (SURPRISED_MOODS.has(moodName)) return "surprised";
  return "neutral";
}

function intensityWord(intensity: number): string {
  if (intensity < 0.3) return "a little";
  if (intensity < 0.65) return "quite";
  return "very";
}

function moodSentence(name: string, snapshot: MemorySnapshot): string {
  const { mood } = snapshot.bond;
  const moodName = mood.name.toLowerCase();

  if (moodName === "neutral") {
    return `${name} feels settled right now.`;
  }

  const base = `${name} feels ${intensityWord(mood.intensity)} ${mood.name}`;
  const causePart = mood.cause ? ` because ${mood.cause}.` : ".";
  const wantsPart = mood.wants ? ` What would help: ${mood.wants}` : "";
  return `${base}${causePart}${wantsPart}`;
}

function lastTalkedLabel(snapshot: MemorySnapshot): string {
  if (snapshot.bond.last_talked_at) {
    return `Last talked ${relativeTime(snapshot.bond.last_talked_at)}`;
  }
  if (snapshot.bond.seconds_since_last_talk != null && snapshot.bond.seconds_since_last_talk > 0) {
    return `Last talked ${relativeTime(snapshot.bond.seconds_since_last_talk)}`;
  }
  return "You haven't talked yet";
}

function factMeta(fact: MemoryFact): string {
  const parts: string[] = [];
  if (fact.source === "user") parts.push("You told them");
  if (fact.source === "legacy") parts.push("From before");
  if (fact.mentions > 1) parts.push(`mentioned ${fact.mentions}×`);
  return parts.join(" · ");
}

export function MemoryStatePanel({ characterId, characterName, onConversationCleared }: Props) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newFactText, setNewFactText] = useState("");
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [addingFact, setAddingFact] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "conversation" | "reset">(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    const generation = ++refreshGenerationRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await getMemorySnapshot(characterId);
      if (generation !== refreshGenerationRef.current) return;
      setSnapshot(data);
    } catch (err) {
      if (generation !== refreshGenerationRef.current) return;
      console.error("Memory panel refresh error:", err);
      setSnapshot(null);
      setError("Couldn't load memory. Try again in a moment.");
    } finally {
      if (generation === refreshGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [characterId]);

  useEffect(() => {
    refresh();
    return () => {
      refreshGenerationRef.current += 1;
    };
  }, [refresh]);

  const groupedFacts = useMemo(() => {
    if (!snapshot) return [];
    const groups = new Map<MemoryFactKind, MemoryFact[]>();
    for (const kind of FACT_KIND_ORDER) {
      groups.set(kind, []);
    }
    for (const fact of snapshot.facts) {
      const bucket = groups.get(fact.kind) ?? groups.get("other")!;
      bucket.push(fact);
    }
    return FACT_KIND_ORDER.map((kind) => ({ kind, facts: groups.get(kind)! })).filter(
      (group) => group.facts.length > 0,
    );
  }, [snapshot]);

  const sortedMoments = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.moments].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [snapshot]);

  const handleAddFact = useCallback(async () => {
    if (!characterId || !newFactText.trim()) return;
    setAddingFact(true);
    setError("");
    try {
      await addMemoryFact(characterId, newFactText.trim());
      setNewFactText("");
      await refresh();
    } catch (err) {
      console.error("Add fact error:", err);
      setError("Couldn't save that. Try again.");
    } finally {
      setAddingFact(false);
    }
  }, [characterId, newFactText, refresh]);

  const startEditing = useCallback((fact: MemoryFact) => {
    setEditingFactId(fact.id);
    setEditingText(fact.text);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingFactId(null);
    setEditingText("");
  }, []);

  const saveEditing = useCallback(async () => {
    if (!characterId || !editingFactId || !editingText.trim()) {
      cancelEditing();
      return;
    }
    setError("");
    try {
      await updateMemoryFact(characterId, editingFactId, editingText.trim());
      cancelEditing();
      await refresh();
    } catch (err) {
      console.error("Update fact error:", err);
      setError("Couldn't update that fact. Try again.");
    }
  }, [characterId, editingFactId, editingText, cancelEditing, refresh]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveEditing();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelEditing();
      }
    },
    [saveEditing, cancelEditing],
  );

  const handleForgetFact = useCallback(
    async (factId: string) => {
      if (!characterId) return;
      setError("");
      try {
        await forgetMemoryFact(characterId, factId);
        if (editingFactId === factId) cancelEditing();
        await refresh();
      } catch (err) {
        console.error("Forget fact error:", err);
        setError("Couldn't forget that fact. Try again.");
      }
    },
    [characterId, editingFactId, cancelEditing, refresh],
  );

  const handleForgetMoment = useCallback(
    async (momentId: string) => {
      if (!characterId) return;
      setError("");
      try {
        await forgetMemoryMoment(characterId, momentId);
        await refresh();
      } catch (err) {
        console.error("Forget moment error:", err);
        setError("Couldn't forget that moment. Try again.");
      }
    },
    [characterId, refresh],
  );

  const clearConversation = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("conversation");
    setError("");
    try {
      await clearChat(characterId);
      await onConversationCleared?.();
    } catch (err) {
      console.error("Clear conversation error:", err);
      setError("Couldn't clear the conversation. Try again.");
    } finally {
      setBusyAction(null);
    }
  }, [characterId, onConversationCleared]);

  const handleReset = useCallback(async () => {
    if (!characterId) return;
    setBusyAction("reset");
    setError("");
    try {
      await resetMemory(characterId);
      setConfirmReset(false);
      await refresh();
    } catch (err) {
      console.error("Reset memory error:", err);
      setError("Couldn't reset memory. Try again.");
    } finally {
      setBusyAction(null);
    }
  }, [characterId, refresh]);

  if (!characterId) {
    return <p className="text-sm text-ink-3">Select a character to inspect memory.</p>;
  }

  if (loading && !snapshot) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Dots />
        <span className="text-sm text-ink-3">Loading memory…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}

      {snapshot && (
        <>
          <section className={sectionCardClass}>
            <div className="flex items-start gap-4">
              <Mascot mood={mascotMoodFromBond(snapshot)} className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                  How {characterName} feels about you
                </h3>
                <p className="mt-1 text-sm text-ink-2">{STAGE_LABELS[snapshot.bond.stage]}</p>

                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-well">
                    <div
                      className="h-full rounded-full bg-accent-300 transition-all"
                      style={{ width: `${Math.round(snapshot.bond.closeness * 100)}%` }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-ink">{moodSentence(characterName, snapshot)}</p>

                <p className="mt-2 text-xs text-ink-3">
                  {lastTalkedLabel(snapshot)} · {snapshot.bond.turns} conversations
                </p>

                {snapshot.bond.threads.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-ink-2">Left hanging</p>
                    <ul className="mt-2 space-y-1.5">
                      {snapshot.bond.threads.map((thread) => (
                        <li key={thread.id} className="flex items-start gap-2 text-sm text-ink-2">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                          <span>{thread.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-4 text-xs text-ink-3">
                  There&apos;s no button to change how {characterName} feels. Talk to them.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              What {characterName} knows about you
            </h3>

            <div className="mt-4 flex gap-2">
              <Input
                value={newFactText}
                onChange={(e) => setNewFactText(e.target.value)}
                placeholder={`Tell ${characterName} something…`}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddFact();
                }}
              />
              <Button
                variant="primary"
                size="sm"
                loading={addingFact}
                disabled={!newFactText.trim()}
                onClick={() => void handleAddFact()}
              >
                Tell {characterName}
              </Button>
            </div>

            {snapshot.facts.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
                <Mascot mood="sleepy" className="h-12 w-12" />
                <p className="text-sm text-ink-3">
                  {characterName} doesn&apos;t know much about you yet. It fills in as you talk.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {groupedFacts.map(({ kind, facts }) => (
                  <div key={kind}>
                    <h4 className="text-sm font-semibold text-ink">{FACT_KIND_HEADINGS[kind]}</h4>
                    <ul className="mt-2 space-y-2">
                      {facts.map((fact) => (
                        <FactRow
                          key={fact.id}
                          fact={fact}
                          editing={editingFactId === fact.id}
                          editingText={editingText}
                          onStartEdit={() => startEditing(fact)}
                          onEditChange={setEditingText}
                          onEditKeyDown={handleEditKeyDown}
                          onSaveEdit={() => void saveEditing()}
                          onCancelEdit={cancelEditing}
                          onForget={() => void handleForgetFact(fact.id)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">Moments</h3>

            {sortedMoments.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">No shared moments yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {sortedMoments.map((moment) => (
                  <MomentRow
                    key={moment.id}
                    moment={moment}
                    onForget={() => void handleForgetMoment(moment.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className={sectionCardClass}>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">Housekeeping</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Clear conversation keeps what {characterName} remembers. Start over forgets everything.
            </p>

            <div className="mt-4 space-y-3">
              <Button
                variant="danger-soft"
                fullWidth
                loading={busyAction === "conversation"}
                disabled={busyAction !== null && busyAction !== "conversation"}
                onClick={() => void clearConversation()}
              >
                Clear conversation
              </Button>

              {confirmReset ? (
                <div className="rounded-card bg-well px-4 py-3">
                  <p className="text-sm text-ink">
                    Forget everything and start fresh? This can&apos;t be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busyAction === "reset"}
                      onClick={() => void handleReset()}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyAction === "reset"}
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="danger-soft"
                  fullWidth
                  disabled={busyAction !== null}
                  onClick={() => setConfirmReset(true)}
                >
                  Start over
                </Button>
              )}
            </div>

            <PathRow label="On this device" value={snapshot.memory_dir} />
          </section>
        </>
      )}
    </div>
  );
}

function FactRow({
  fact,
  editing,
  editingText,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onSaveEdit,
  onCancelEdit,
  onForget,
}: {
  fact: MemoryFact;
  editing: boolean;
  editingText: string;
  onStartEdit: () => void;
  onEditChange: (text: string) => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onForget: () => void;
}) {
  const meta = factMeta(fact);

  return (
    <li className="rounded-card bg-surface px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={editingText}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={onEditKeyDown}
              onBlur={() => {
                const trimmed = editingText.trim();
                if (!trimmed || trimmed === fact.text) {
                  onCancelEdit();
                  return;
                }
                onSaveEdit();
              }}
              autoFocus
              className="text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="w-full text-left text-sm leading-relaxed text-ink hover:text-ink-2"
            >
              {fact.text}
            </button>
          )}
          {meta && <p className="mt-1 text-xs text-ink-3">{meta}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5">
          {!editing && (
            <IconButton
              label="Edit"
              size="sm"
              variant="ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onStartEdit}
            >
              <EditIcon className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton
            label="Forget"
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onForget}
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function MomentRow({ moment, onForget }: { moment: MemoryMoment; onForget: () => void }) {
  return (
    <li className="rounded-card bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-3">{relativeTime(moment.at)}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{moment.summary}</p>
          {moment.feeling && (
            <Pill size="xs" tone="neutral" className="mt-2">
              felt {moment.feeling}
            </Pill>
          )}
        </div>
        <IconButton label="Forget" size="sm" variant="ghost" onClick={onForget}>
          <TrashIcon className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-5">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 break-all font-mono text-xs text-ink-2">{value}</div>
    </div>
  );
}
