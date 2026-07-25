import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ChatPanel } from "./components/ChatPanel";
import { ChatHistorySidebar } from "./components/chat/ChatHistorySidebar";
import { FloatingChatInput } from "./components/chat/FloatingChatInput";
import { MeuxeMark } from "./components/ui/MeuxeMark";
import { AddCharacterModal } from "./components/AddCharacterModal";
import { CharacterSelect } from "./components/CharacterSelect";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { MiniWidget } from "./components/MiniWidget";
import { useChat } from "./hooks/useChat";
import { useAudioQueue } from "./hooks/useAudioQueue";
import { useVoice } from "./hooks/useVoice";
import { useWindow } from "./hooks/useWindow";
import {
  getConfig,
  listCharacters,
  listModels,
  getExpressions,
  getModelExpressions,
  getChatHistory,
  clearChat,
  resolveAssetUrl,
} from "./api/tauri";
import type { Character, ModelInfo } from "./types";

const Live2DCanvas = lazy(() =>
  import("./components/Live2DCanvas").then((m) => ({ default: m.Live2DCanvas }))
);
const VRMCanvas = lazy(() =>
  import("./components/VRMCanvas").then((m) => ({ default: m.VRMCanvas }))
);


function App() {
  const { isMiniMode, miniCharacterId, toggleMini } = useWindow();

  // Refs for global shortcut callbacks (so they always see latest state)
  const selectedCharIdRef = useRef("");

  // Trigger to open mini composer from global shortcut
  const [miniComposerTrigger, setMiniComposerTrigger] = useState(0);
  // Ref for focus chat input in full mode
  const fullChatInputRef = useRef<HTMLInputElement>(null);
  // Ref for mic toggle
  const handleMicToggleRef = useRef<() => void>(() => {});

  // Global shortcuts — registered once from main window, work in all modes
  // Actions are dispatched via Tauri events so both windows can respond
  useEffect(() => {
    if (isMiniMode) return; // only main window registers shortcuts

    const TOGGLE = "CommandOrControl+Shift+E";
    const TEXT = "CommandOrControl+Shift+Space";
    const MIC = "CommandOrControl+Shift+M";
    const registered: string[] = [];

    const setup = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const broadcast = (event: string) => invoke("broadcast_event", { event }).catch(() => {});

      try {
        await register(TOGGLE, (event) => {
          if (event.state === "Pressed") {
            toggleMini(selectedCharIdRef.current || undefined);
          }
        });
        registered.push(TOGGLE);
      } catch (err) {
        console.error("Failed to register toggle shortcut:", err);
      }

      try {
        await register(TEXT, (event) => {
          if (event.state === "Pressed") {
            broadcast("shortcut:text");
          }
        });
        registered.push(TEXT);
      } catch (err) {
        console.error("Failed to register text shortcut:", err);
      }

      try {
        await register(MIC, (event) => {
          if (event.state === "Pressed") {
            broadcast("shortcut:mic");
          }
        });
        registered.push(MIC);
      } catch (err) {
        console.error("Failed to register mic shortcut:", err);
      }
    };

    void setup();
    return () => {
      for (const s of registered) {
        unregister(s).catch(() => {});
      }
    };
  }, [isMiniMode, toggleMini]);

  // Listen for shortcut events (both windows listen, only the active one acts)
  useEffect(() => {
    const unlistenText = listen("shortcut:text", () => {
      if (isMiniMode) {
        setMiniComposerTrigger((n) => n + 1);
      } else {
        fullChatInputRef.current?.focus();
      }
    });
    const unlistenMic = listen("shortcut:mic", () => {
      handleMicToggleRef.current();
    });
    return () => {
      unlistenText.then((fn) => fn());
      unlistenMic.then((fn) => fn());
    };
  }, [isMiniMode]);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  selectedCharIdRef.current = selectedCharId;
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [background, setBackground] = useState("transparent");
  const [zoom, setZoom] = useState(1.1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [expressionsConfigured, setExpressionsConfigured] = useState<boolean | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [userTyping, setUserTyping] = useState(false);

  const {
    setMessages,
    timeline,
    isStreaming,
    streamingText,
    send,
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    toolCalls,
    handleConfirm,
  } = useChat();
  const { listening, startListening, stopListening } = useVoice();
  const {
    speaking,
    beginRequest,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
    setNeutralExpression,
  } = useAudioQueue();

  const selectedCharRef = useRef<Character | undefined>(undefined);

  const loadHistory = useCallback(
    async (characterId: string) => {
      try {
        const history = (await getChatHistory(characterId)) as Array<{
          role: "user" | "assistant";
          content?: string;
          text?: string;
          expression?: string;
        }>;
        setMessages(
          history.map((m) => ({
            role: m.role,
            content: m.content ?? m.text ?? "",
            expression: m.expression,
          }))
        );
      } catch (err) {
        console.error("History load error:", err);
      }
    },
    [setMessages]
  );

  const clearMessages = useCallback(
    async (characterId?: string) => {
      if (characterId) {
        await clearChat(characterId).catch(console.error);
      }
      setMessages([]);
    },
    [setMessages]
  );

  const refreshCharacters = useCallback(
    async (preferredId?: string) => {
      try {
        const data = await listCharacters();
        const chars = data as Character[];
        setCharacters(chars);

        if (preferredId && chars.some((char) => char.id === preferredId)) {
          setSelectedCharId(preferredId);
          return;
        }

        if (!selectedCharId && chars.length > 0) {
          setSelectedCharId(chars[0].id);
        } else if (selectedCharId && !chars.some((char) => char.id === selectedCharId) && chars.length > 0) {
          setSelectedCharId(chars[0].id);
        }
      } catch (err) {
        console.error("Character list load error:", err);
      }
    },
    [selectedCharId]
  );

  // Wire audio queue events to model
  useEffect(() => {
    setOnExpressionChange((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpressionChange]);

  // Wire chat sentence events to audio queue
  useEffect(() => {
    setOnSentence((payload) => {
      addSentence(payload.request_id, payload);
    });
    setOnAudio((payload) => {
      addAudio(payload.request_id, payload.index, payload.data);
    });
    setOnAudioFailed((payload) => {
      failAudio(payload.request_id, payload.index);
    });
    setOnDone((payload) => {
      markTextDone(payload.request_id);
    });
    setOnError((requestId) => {
      failRequest(requestId);
    });
  }, [
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
  ]);

  useEffect(() => {
    refreshCharacters();
    listModels()
      .then((data) => setModels(data as ModelInfo[]))
      .catch(console.error);
  }, [refreshCharacters]);

  useEffect(() => {
    getConfig()
      .then((data) => {
        console.log("[App] config loaded:", JSON.stringify(data));
        const cfg = data as Record<string, unknown>;
        const complete = !!(cfg.onboarding_complete ?? cfg.onboardingComplete ?? false);
        console.log("[App] onboardingComplete =", complete);
        setOnboardingComplete(complete);
        const activeChar = ((cfg.active_character ?? cfg.activeCharacter ?? "") as string);
        if (miniCharacterId) {
          setSelectedCharId(miniCharacterId);
        } else if (activeChar) {
          setSelectedCharId(activeChar);
        }
      })
      .catch((err) => {
        console.error("[App] config load error:", err);
        setOnboardingComplete(false);
      });
  }, [miniCharacterId]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId),
    [characters, selectedCharId]
  );
  selectedCharRef.current = selectedChar;

  const selectedModel = useMemo(() => {
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  }, [selectedChar, models]);

  const [resolvedModelPath, setResolvedModelPath] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModel?.path) {
      setResolvedModelPath(null);
      return;
    }

    let cancelled = false;
    resolveAssetUrl(selectedModel.path)
      .then((url) => {
        if (!cancelled) {
          setResolvedModelPath(url);
        }
      })
      .catch((err) => {
        console.error("[App] Failed to resolve model asset URL:", err);
        if (!cancelled) {
          setResolvedModelPath(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedModel?.path]);

  const modelPath = resolvedModelPath;
  const modelType = selectedModel?.type === "vrm" ? "vrm" : "live2d";
  const modelMapping = selectedModel?.mapping ?? null;

  // Match chat backend: expression files are keyed by character.live2d_model.
  const expressionModelId = selectedChar?.live2d_model || selectedModel?.id || null;

  const refreshExpressionConfiguration = useCallback(async () => {
    if (!expressionModelId) {
      setExpressionsConfigured(true);
      return;
    }

    try {
      const [modelExpressions, mapping] = await Promise.all([
        getModelExpressions(expressionModelId),
        getExpressions(expressionModelId),
      ]);

      const hasModelExpressions = modelExpressions.length > 0;
      const hasMapping = Object.values(mapping).some((value) => value.trim().length > 0);

      setExpressionsConfigured(!hasModelExpressions || hasMapping);
      if (mapping["neutral"]) {
        setNeutralExpression(mapping["neutral"]);
      }
    } catch (err) {
      console.error("Expression configuration load error:", err);
      setExpressionsConfigured(true);
    }
  }, [expressionModelId, setNeutralExpression]);

  // Check if expression mapping is configured for current model
  useEffect(() => {
    refreshExpressionConfiguration();
  }, [refreshExpressionConfiguration]);

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    refreshCharacters();
    if (selectedCharId) {
      loadHistory(selectedCharId);
    }
    if (expressionModelId) {
      refreshExpressionConfiguration().catch(console.error);
    }
  }, [
    refreshCharacters,
    selectedCharId,
    loadHistory,
    expressionModelId,
    refreshExpressionConfiguration,
  ]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId || !expressionsConfigured) return;
      const requestId = crypto.randomUUID();
      beginRequest(requestId);
      await send(selectedCharId, text, requestId);
    },
    [selectedCharId, expressionsConfigured, send, beginRequest]
  );

  useEffect(() => {
    if (!selectedCharId) return;
    setMessages([]);
    loadHistory(selectedCharId);
  }, [selectedCharId, loadHistory, setMessages]);

  // Reload chat history when switching from mini mode back to full mode
  useEffect(() => {
    const unlisten = listen<{ mode: string }>("app:mode-changed", (event) => {
      if (event.payload.mode === "full" && selectedCharId) {
        loadHistory(selectedCharId);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedCharId, loadHistory]);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      setUserTyping(isTyping);
    },
    []
  );

  const pendingToolConfirm = toolCalls.find((tc) => tc.status === "awaiting_confirmation") ?? null;

  const handleMicToggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening((transcript) => {
        handleSend(transcript);
      });
    }
  }, [listening, startListening, stopListening, handleSend]);
  handleMicToggleRef.current = handleMicToggle;

  const handleCharacterChange = useCallback(
    (id: string) => {
      setSelectedCharId(id);
      setMessages([]);
      clearQueue();
      setCurrentExpression("neutral");
      setZoom(1.1);
    },
    [setMessages, clearQueue]
  );

  const handleCharacterCreated = useCallback(
    async (characterId: string) => {
      try {
        const data = await listModels();
        setModels(data as ModelInfo[]);
      } catch (err) {
        console.error("Model list load error:", err);
      }
      await refreshCharacters(characterId);
      setMessages([]);
      clearQueue();
      setCurrentExpression("neutral");
      setZoom(1.1);
      setSettingsOpen(false);
    },
    [refreshCharacters, setMessages, clearQueue]
  );

  const [framing, setFraming] = useState<"full" | "half">("full");

  const canvasProps = useMemo(
    () => ({
      modelPath,
      expression: currentExpression,
      speaking,
      userTyping,
      uiMode: isMiniMode ? "mini" as const : "full" as const,
      background,
      zoom,
      framing,
      onZoomChange: setZoom,
      onBackgroundChange: setBackground,
      onFramingChange: setFraming,
      getAudioLevels,
    }),
    [modelPath, currentExpression, speaking, userTyping, isMiniMode, background, zoom, framing, getAudioLevels]
  );

  const avatarCanvas = useMemo(() => (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">
          Loading model...
        </div>
      }
    >
      {modelType === "vrm" ? (
        <VRMCanvas
          key={`vrm-${selectedCharId}`}
          {...canvasProps}
          animations={selectedModel?.animations}
        />
      ) : (
        <Live2DCanvas
          key={`l2d-${selectedCharId}`}
          {...canvasProps}
          modelMapping={modelMapping}
        />
      )}
    </Suspense>
  ), [modelType, selectedCharId, canvasProps, selectedModel?.animations, modelMapping]);

  // Mini mode: render just the avatar in MiniWidget
  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={avatarCanvas}
        listening={listening}
        speaking={speaking}
        isStreaming={isStreaming}
        streamingText={streamingText}
        toolCalls={toolCalls}
        onSend={handleSend}
        onMicToggle={handleMicToggle}
        onToolConfirm={handleConfirm}
        pendingConfirmation={pendingToolConfirm !== null}
        openComposerTrigger={miniComposerTrigger}
      />
    );
  }

  const charName = selectedChar?.name || "Companion";

  if (onboardingComplete === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="flex flex-col items-center gap-5">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce" />
          </div>
          <div className="text-slate-400 font-semibold text-sm tracking-wide uppercase">Loading</div>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={() => {
          setOnboardingComplete(true);
          getConfig()
            .then((cfg) => {
              const config = cfg as { active_character?: string };
              refreshCharacters(config.active_character);
            })
            .catch(() => refreshCharacters());
          listModels()
            .then((data) => setModels(data as ModelInfo[]))
            .catch(console.error);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-100 via-white to-indigo-50/40 font-sans text-slate-800">
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/60 bg-white/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MeuxeMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-800">{charName}</h1>
            {selectedChar?.source_type === "directory" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Layered soul</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/90 px-2 py-1 shadow-sm ring-1 ring-slate-100">
          <button
            onClick={() => toggleMini(selectedCharId)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-violet-600 hover:bg-violet-50"
            title="Switch to mini mode"
          >
            Mini
          </button>
          <button
            onClick={() => (settingsOpen ? handleSettingsClose() : setSettingsOpen(true))}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              settingsOpen ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Settings
          </button>
          <CharacterSelect
            characters={characters}
            selected={selectedCharId}
            onSelect={handleCharacterChange}
            onAddCharacter={() => setAddCharacterOpen(true)}
            open={charSelectOpen}
            onToggle={() => setCharSelectOpen(!charSelectOpen)}
          />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {!settingsOpen && expressionsConfigured && (
          <ChatHistorySidebar open={historyOpen} onToggle={() => setHistoryOpen((o) => !o)}>
            <ChatPanel
              hideInput
              timeline={timeline}
              loading={isStreaming}
              streamingText={streamingText}
              characterName={charName}
              onSend={handleSend}
              onTypingChange={handleTypingChange}
              listening={listening}
              onMicToggle={handleMicToggle}
              onToolConfirm={handleConfirm}
            />
          </ChatHistorySidebar>
        )}

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {expressionsConfigured === null ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-bounce" />
              </div>
            </div>
          ) : !expressionsConfigured ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-2xl font-bold text-orange-500">
                !
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-800">Map expressions first</h3>
              <p className="mb-6 max-w-sm text-sm text-slate-500 leading-relaxed">
                Your avatar needs emotion mapping before chat. It only takes a minute in Settings.
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
              >
                Open Settings
              </button>
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-none sm:m-3 sm:rounded-[2rem] sm:ring-1 sm:ring-slate-200/80 sm:shadow-inner">
                {avatarCanvas}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-5 pt-8 sm:pb-7"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.08) 45%, transparent 100%)",
                  }}
                >
                  {(speaking || isStreaming) && (
                    <div
                      className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-white/80"
                    >
                      {speaking && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />}
                      <span>{speaking ? "Speaking" : "Thinking…"}</span>
                    </div>
                  )}
                  <FloatingChatInput
                    isProcessing={isStreaming}
                    onSend={handleSend}
                    onTypingChange={handleTypingChange}
                    listening={listening}
                    onMicToggle={handleMicToggle}
                    inputRef={fullChatInputRef}
                  />
                </div>
              </div>
            </>
          )}
        </main>

        {settingsOpen && (
          <aside
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[420px] flex-col border-l border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
          >
            <Settings
              characterId={selectedCharId}
              characterName={charName}
              modelId={expressionModelId || ""}
              onPreviewExpression={(expr) => setCurrentExpression(expr)}
              onExpressionsSaved={() => {
                refreshExpressionConfiguration().catch(console.error);
              }}
              onConversationCleared={async () => {
                await clearMessages(selectedCharId);
              }}
              onResetAll={() => {
                setSettingsOpen(false);
                setOnboardingComplete(false);
                setCharacters([]);
                setSelectedCharId("");
                setMessages([]);
                clearQueue();
                setExpressionsConfigured(null);
                setCurrentExpression("neutral");
              }}
              onResetOnboarding={() => {
                setSettingsOpen(false);
                setOnboardingComplete(false);
              }}
              onClose={handleSettingsClose}
            />
          </aside>
        )}
      </div>

      <AddCharacterModal
        open={addCharacterOpen}
        onClose={() => setAddCharacterOpen(false)}
        onCreated={handleCharacterCreated}
      />
    </div>
  );
}

export default App;
