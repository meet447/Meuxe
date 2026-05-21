import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ChatPanel } from "./components/ChatPanel";
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
  toAssetUrl,
} from "./api/tauri";
import type { Character, ModelInfo, ChatMessage } from "./types";

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
  const [expressionsConfigured, setExpressionsConfigured] = useState<boolean | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [userTyping, setUserTyping] = useState(false);

  const { messages, setMessages, isStreaming, streamingText, send, setOnSentence, setOnAudio, toolCalls, handleConfirm } =
    useChat();
  const { listening, startListening, stopListening } = useVoice();
  const { speaking, addSentence, addAudio, clearQueue, getAudioLevels, setOnExpressionChange, setNeutralExpression } =
    useAudioQueue();

  const selectedCharRef = useRef<Character | undefined>(undefined);

  // Map internal messages (content field) to ChatMessage type (text field) for ChatPanel
  const chatMessages = useMemo<ChatMessage[]>(
    () =>
      messages.map((m) => ({
        role: m.role,
        text: m.content,
        expression: m.expression,
      })),
    [messages]
  );


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
    setOnSentence((task) => {
      addSentence(task);
    });
    setOnAudio((index, audio) => {
      addAudio(index, audio);
    });
  }, [setOnSentence, setOnAudio, addSentence, addAudio]);

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

  const modelPath = selectedModel?.path ? toAssetUrl(selectedModel.path) : null;
  const modelType = selectedModel?.type ?? "live2d";
  const modelMapping = selectedModel?.mapping ?? null;

  // The model ID for expression lookups: use the selectedModel ID if available,
  // otherwise fall back to the character's live2d_model field directly
  const expressionModelId = selectedModel?.id ?? selectedChar?.live2d_model ?? null;

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
      const hasMapping = Object.keys(mapping).length > 0;

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



  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId || !expressionsConfigured) return;
      clearQueue();

      await send(selectedCharId, text);
    },
    [selectedCharId, expressionsConfigured, send, clearQueue]
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
    <div className="h-screen flex flex-col font-sans text-slate-800" style={{ backgroundColor: "transparent" }}>
      {/* Wavy background for header */}
      <svg
        className="absolute top-0 left-0 w-full z-0 pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 1440 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ height: "6rem" }}
      >
        <path d="M0,0 L1440,0 L1440,60 C1240,100 960,20 720,60 C480,100 240,40 0,80 Z" fill="#eaf3fd" />
      </svg>

      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-700 tracking-wide uppercase">{charName}</h1>
            {selectedChar?.source_type === "directory" && (
              <span className="rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                layered soul
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm shadow-blue-900/5 ring-1 ring-slate-100">
          <button
            onClick={() => toggleMini(selectedCharId)}
            className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors hover:bg-violet-100 text-violet-600"
            title="Switch to mini mode"
          >
            Mini
          </button>

          <div className="text-slate-300">|</div>

          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              settingsOpen
                ? "bg-blue-100 text-blue-700"
                : "hover:bg-slate-100 text-slate-600"
            }`}
          >
            {settingsOpen ? "Chat" : "Settings"}
          </button>

          <div className="text-slate-300">|</div>

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

      <div className="flex-1 flex overflow-hidden relative z-0 pl-10 pr-6 pb-6">
        <div className="flex-1 relative rounded-3xl overflow-hidden mr-6">
          {avatarCanvas}
        </div>

        <div className="w-[420px] rounded-[2rem] bg-white border border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-blue-900/5 my-2 mr-2 flex flex-col overflow-hidden relative backdrop-blur-3xl bg-white/95">
          {settingsOpen ? (
            <Settings
              characterId={selectedCharId}
              characterName={charName}
              modelId={selectedModel?.id || expressionModelId || ""}
              onPreviewExpression={(expr) => setCurrentExpression(expr)}
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
              onClose={() => {
                setSettingsOpen(false);
                refreshCharacters();
                if (selectedCharId) {
                  loadHistory(selectedCharId);
                }
                if (expressionModelId) {
                  refreshExpressionConfiguration().catch(console.error);
                }
              }}
            />
          ) : expressionsConfigured === null ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce" />
              </div>
            </div>
          ) : !expressionsConfigured ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-orange-50/50">
              <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-3xl font-bold mb-6 shadow-sm">
                !
              </div>
              <h3 className="text-slate-800 font-semibold text-lg mb-3">Expression Mapping Required</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                This model's expressions need to be mapped before chatting. Open Settings to preview
                each expression and assign them to emotions.
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 rounded-full px-8 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              >
                Configure Expressions
              </button>
            </div>
          ) : (
            <ChatPanel
              messages={chatMessages}
              loading={isStreaming}
              streamingText={streamingText}
              characterName={charName}
              onSend={handleSend}
              onTypingChange={handleTypingChange}
              listening={listening}
              onMicToggle={handleMicToggle}
              toolCalls={toolCalls}
              onToolConfirm={handleConfirm}
              inputRef={fullChatInputRef}
            />
          )}
        </div>
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
