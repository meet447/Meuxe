import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CharacterSelect } from "./CharacterSelect";
import type { Character } from "../types";

const characters: Character[] = [
  {
    id: "a",
    name: "Aria",
    live2d_model: "haru",
    voice: "",
    default_emotion: "neutral",
    source_type: "directory",
  },
  {
    id: "b",
    name: "Uma",
    live2d_model: "utsuwa",
    voice: "",
    default_emotion: "neutral",
    source_type: "directory",
  },
  {
    id: "c",
    name: "Faye",
    live2d_model: "osa-foo",
    voice: "",
    default_emotion: "neutral",
    source_type: "directory",
  },
  {
    id: "d",
    name: "Empty",
    live2d_model: "",
    voice: "",
    default_emotion: "neutral",
    source_type: "directory",
  },
];

describe("CharacterSelect", () => {
  it("shows look labels with model types", () => {
    render(
      <CharacterSelect
        characters={characters}
        models={[{ id: "osa-foo", type: "vrm" }]}
        selected="a"
        onSelect={vi.fn()}
        onAddCharacter={vi.fn()}
        open
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Haru · Live2D")).toBeInTheDocument();
    expect(screen.getByText("Utsuwa · VRM")).toBeInTheDocument();
    expect(screen.getByText("Foo · VRM")).toBeInTheDocument();
    expect(screen.getByText("Default look")).toBeInTheDocument();
  });
});
