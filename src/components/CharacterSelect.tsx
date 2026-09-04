import type { Character } from "../types";
import {
  Button,
  ChevronDownIcon,
  PeopleIcon,
  PlusIcon,
  Surface,
  cn,
} from "./ui";

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
      <div className="fixed inset-0 z-40" onClick={onToggle} aria-hidden />
      <Surface
        tone="raised"
        elevation="pop"
        radius="panel"
        className={cn(
          "z-50 w-72 overflow-hidden animate-rise-in",
          menuOnly ? "fixed left-20 top-20" : "absolute right-0 top-full mt-3",
        )}
      >
        <div className="px-5 pt-4 pb-3">
          <h3 className="text-sm font-semibold text-ink">Companions</h3>
          <p className="mt-0.5 text-xs text-ink-3">Switch companion</p>
        </div>
        <div className="max-h-72 overflow-y-auto px-3 pb-3 scrollbar-thin">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => {
                onSelect(char.id);
                onToggle();
              }}
              className={cn(
                "mb-1 flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left transition-all",
                selected === char.id
                  ? "bg-accent-100 text-accent-700"
                  : "text-ink hover:bg-well",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  selected === char.id ? "bg-accent-200 text-accent-700" : "bg-well text-ink-2",
                )}
              >
                {char.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{char.name}</div>
                <div className="mt-0.5 text-xs text-ink-3">{char.live2d_model || "default"}</div>
              </div>
            </button>
          ))}
          <button
            onClick={() => {
              onToggle();
              onAddCharacter();
            }}
            className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left text-ink transition-all hover:bg-well"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-well">
              <PlusIcon className="h-4 w-4 text-ink-2" />
            </div>
            <div className="text-sm font-semibold">Add companion</div>
          </button>
        </div>
      </Surface>
    </>
  );

  if (menuOnly) {
    return <div className="relative">{panel}</div>;
  }

  return (
    <div className="relative flex items-center">
      <Button
        variant="ghost"
        onClick={onToggle}
        leading={<PeopleIcon className="h-4 w-4" />}
        trailing={
          <ChevronDownIcon
            className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
          />
        }
      >
        Companions
      </Button>
      {panel}
    </div>
  );
}
