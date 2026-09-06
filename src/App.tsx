import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ChatPanel } from "./components/ChatPanel";
import { HistoryDrawer } from "./components/chat/HistoryDrawer";
import { FloatingChatInput } from "./components/chat/FloatingChatInput";
import { Sidebar } from "./components/shell/Sidebar";
import { Button, Dots, Mascot, Pill } from "./components/ui";
import { AddCharacterModal } from "./components/AddCharacterModal";
import { CharacterSelect } from "./components/CharacterSelect";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { MiniWidget } from "./components/MiniWidget";
import { useChat, cleanCompanionDisplayText } from "./hooks/useChat";
import { unlockAudioPlayback, useAudioQueue } from "./hooks/useAudioQueue";
import { useVoice } from "./hooks/useVoice";
import { useWindow } from "./hooks/useWindow";
import {
  getConfig,
  setActiveCharacter,
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


function devAvatarPreview(): "haru" | "utsuwa" | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get("avatar");
  if (value === "haru" || value === "utsuwa") return value;
  return null;
}

function App() {
  const avatarPreview = useMemo(() => devAvatarPreview(), []);
  const { isMiniMode, miniCharacterId, toggleMini } = useWindow();

  // Refs for global shortcut callbacks (so they always see latest state)
  const selectedCharIdRef = useRef("");

  // Trigger to open mini composer from global shortcut
  const [miniComposerTrigger, setMiniComposerTrigger] = useState(0);
  // Ref for focus chat input in full mode
  const fullChatInputRef = useRef<HTMLInputElement>(null);
  // Ref for mic toggle
  const handleMicToggleRef = useRef<() => void>(() => {});

  // Global shortcuts: registered once from main window, work in all modes
  // Actions are dispatched via Tauri events so both windows can respond
  useEffect(() => {
    if (isMiniMode) return; // only main window registers shortcuts

    const TOGGLE = "CommandOrControl+Shift+E";
    const TEXT = "CommandOrControl+Shift+Space";
    const MIC = "CommandOrControl+Shift+M";
    const registered: string[] = [];

    const setup = async () => {
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
  const [historyOpen, setHistoryOpen] = useState(false);
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
    speakingSentence,
    speechSessionActive,
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
    if (avatarPreview) {
      setOnboardingComplete(true);
      setExpressionsConfigured(true);
      const expr = new URLSearchParams(window.location.search).get("expr") || "happy";
      const mapped =
        avatarPreview === "haru"
          ? ({
              happy: "F05",
              angry: "F02",
              sad: "F03",
              surprised: "F06",
              thinking: "F08",
              embarrassed: "F07",
              blush: "F07",
              smirk: "F04",
              excited: "F05",
              scared: "F06",
              disgusted: "F02",
              neutral: "F01",
            }[expr] ?? expr)
          : expr;
      setCurrentExpression(mapped);
    }
  }, [avatarPreview]);

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
        setOnboardingComplete(avatarPreview ? true : false);
      });
  }, [miniCharacterId, avatarPreview]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId),
    [characters, selectedCharId]
  );
  selectedCharRef.current = selectedChar;

  const selectedModel = useMemo(() => {
    if (avatarPreview === "haru") {
      return {
        id: "haru",
        type: "live2d" as const,
        model_file: "Haru.model3.json",
        path: "models/live2d/haru/Haru.model3.json",
        mapping: null,
      };
    }
    if (avatarPreview === "utsuwa") {
      return {
        id: "utsuwa",
        type: "vrm" as const,
        model_file: "utsuwa.vrm",
        path: "models/vrm/utsuwa/utsuwa.vrm",
        mapping: null,
        animations: [
          { name: "idle", path: "models/vrm/utsuwa/animations/idle.vrma" },
          { name: "talking", path: "models/vrm/utsuwa/animations/talking.vrma" },
        ],
      };
    }
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  }, [avatarPreview, selectedChar, models]);

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
      unlockAudioPlayback();
      const requestId = crypto.randomUUID();
      beginRequest(requestId);
      await send(selectedCharId, text, requestId);
    },
    [selectedCharId, expressionsConfigured, send, beginRequest]
  );

  useEffect(() => {
    const unlock = () => unlockAudioPlayback();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

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
      setActiveCharacter(id).catch(console.error);
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
      setActiveCharacter(characterId).catch(console.error);
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
        <div className="flex h-full w-full items-center justify-center text-sm text-ink-3">
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

  const charName = selectedChar?.name || "Companion";

  const spokenCaption = useMemo(() => {
    if (speakingSentence?.trim()) {
      return cleanCompanionDisplayText(speakingSentence);
    }
    return null;
  }, [speakingSentence]);

  // Mini mode: render just the avatar in MiniWidget
  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={avatarCanvas}
        listening={listening}
        speaking={speaking}
        isStreaming={isStreaming}
        speechSessionActive={speechSessionActive}
        caption={spokenCaption}
        captionSpeaker={spokenCaption ? charName : undefined}
        toolCalls={toolCalls}
        onSend={handleSend}
        onMicToggle={handleMicToggle}
        onToolConfirm={handleConfirm}
        pendingConfirmation={pendingToolConfirm !== null}
        openComposerTrigger={miniComposerTrigger}
      />
    );
  }

  if (onboardingComplete === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <Mascot mood="sleepy" className="h-20 w-20" />
          <Dots tone="accent" />
          <p className="text-sm text-ink-3">Waking up…</p>
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

  const companionStatus = listening
    ? { tone: "peach" as const, label: "Listening" }
    : speaking
      ? { tone: "accent" as const, label: "Speaking" }
      : isStreaming || (speechSessionActive && !speaking)
        ? { tone: "honey" as const, label: "Thinking" }
        : null;

  return (
    <div className="flex h-screen gap-3 bg-canvas p-3 font-sans text-ink">
      {expressionsConfigured && (
        <Sidebar
          historyOpen={historyOpen}
          onHistoryToggle={() => {
            setHistoryOpen((o) => !o);
            setCharSelectOpen(false);
          }}
          onMini={() => toggleMini(selectedCharId)}
          onSettings={() => {
            setSettingsOpen((o) => !o);
            setCharSelectOpen(false);
          }}
          settingsOpen={settingsOpen}
          onCharacters={() => {
            setCharSelectOpen((o) => !o);
            setHistoryOpen(false);
          }}
          charSelectOpen={charSelectOpen}
          framing={framing}
          onFramingChange={setFraming}
        />
      )}

      <main className="squircle relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-panel bg-surface shadow-soft">
        {expressionsConfigured === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Mascot mood="sleepy" className="h-20 w-20" />
            <Dots tone="accent" />
            <p className="text-sm text-ink-3">Waking up…</p>
          </div>
        ) : !expressionsConfigured ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
            <Mascot mood="thinking" className="h-20 w-20" />
            <p className="max-w-sm text-sm leading-relaxed text-ink-2">
              Map your companion&apos;s expressions in Settings before you chat.
            </p>
            <Button variant="primary" onClick={() => setSettingsOpen(true)}>
              Open settings
            </Button>
          </div>
        ) : (
          <>
            <div className="absolute inset-0">{avatarCanvas}</div>

            <CharacterSelect
              menuOnly
              characters={characters}
              selected={selectedCharId}
              onSelect={handleCharacterChange}
              onAddCharacter={() => setAddCharacterOpen(true)}
              open={charSelectOpen}
              onToggle={() => setCharSelectOpen(false)}
            />

            <div className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-full bg-surface-2/90 py-1.5 pl-1.5 pr-3.5 shadow-soft backdrop-blur">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">
                {charName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-ink">{charName}</span>
              {companionStatus && (
                <Pill tone={companionStatus.tone} dot pulse>
                  {companionStatus.label}
                </Pill>
              )}
              {avatarPreview && (
                <Pill tone="honey">{currentExpression}</Pill>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-6 pt-16">
              <FloatingChatInput
                isProcessing={isStreaming}
                onSend={handleSend}
                onTypingChange={handleTypingChange}
                listening={listening}
                onMicToggle={handleMicToggle}
                inputRef={fullChatInputRef}
                caption={spokenCaption}
                captionSpeaker={spokenCaption ? charName : undefined}
              />
            </div>
          </>
        )}
      </main>

      {expressionsConfigured && (
        <HistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title={`Chat with ${charName}`}
        >
          <ChatPanel
            hideInput
            appearance="light"
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
        </HistoryDrawer>
      )}

      {settingsOpen && (
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
          avatarZoom={zoom}
          avatarBackground={background}
          onAvatarZoomChange={setZoom}
          onAvatarBackgroundChange={setBackground}
        />
      )}

      <AddCharacterModal
        open={addCharacterOpen}
        onClose={() => setAddCharacterOpen(false)}
        onCreated={handleCharacterCreated}
      />
    </div>
  );
}

export default App;
