import type { Character } from "../types";

interface Props {
  characters: Character[];
  selected: string;
  onSelect: (id: string) => void;
  onAddCharacter: () => void;
  open: boolean;
  onToggle: () => void;
  /** Corner toolbar mode — no trigger button, fixed panel */
  menuOnly?: boolean;
}

export function CharacterSelect({
  characters,
  selected,
  onSelect,
  onAddCharacter,
  open,
  onToggle,
  menuOnly = false,
}: Props) {
  const panel = open && (
    <>
      <div className="fixed inset-0 z-40" onClick={onToggle} />
      <div
        className={`z-50 w-80 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 animate-in fade-in slide-in-from-top-2 duration-300 ${
          menuOnly ? "fixed left-5 top-28" : "absolute right-0 top-full mt-3"
        }`}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-[15px] font-bold tracking-tight text-white">Characters</h3>
          <p className="mt-1 text-xs text-white/45">Switch companion</p>
        </div>
        <div className="max-h-72 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => {
                onSelect(char.id);
                onToggle();
              }}
              className={`mb-1.5 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-all ${
                selected === char.id
                  ? "bg-white/10 font-medium text-white ring-1 ring-white/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${
                    selected === char.id ? "bg-indigo-500 text-white" : "bg-white/10 text-white/70"
                  }`}
                >
                  {char.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-[14px] font-semibold">{char.name}</div>
                  <div className="mt-0.5 text-xs text-white/40">{char.live2d_model || "default"}</div>
                </div>
              </div>
            </button>
          ))}
          <button
            onClick={() => {
              onToggle();
              onAddCharacter();
            }}
            className="mb-1.5 flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-white/20 px-4 py-3.5 text-left text-white/80 hover:bg-white/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold text-white">
              +
            </div>
            <div>
              <div className="text-[14px] font-semibold">Add character</div>
            </div>
          </button>
        </div>
      </div>
    </>
  );

  if (menuOnly) {
    return <div className="relative">{panel}</div>;
  }

  return (
    <div className="relative flex items-center">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
          open ? "bg-blue-50 text-blue-600" : "hover:bg-slate-100/80 text-slate-600"
        }`}
      >
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Characters
        <svg
          className={`ml-0.5 h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {panel}
    </div>
  );
}
