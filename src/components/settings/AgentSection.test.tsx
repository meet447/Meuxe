import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentSection, type AgentSectionValue } from "./AgentSection";

const baseValue: AgentSectionValue = {
  preset: "opencode",
  program: "",
  args: "",
  auto_approve_tools: true,
};

describe("AgentSection", () => {
  it("renders preset options and tool-permission choices", () => {
    render(<AgentSection value={baseValue} onChange={vi.fn()} />);
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.getByText("Allow automatically")).toBeInTheDocument();
    expect(screen.getByText("Ask me each time")).toBeInTheDocument();
  });

  it("calls onChange when tool permission changes", () => {
    const onChange = vi.fn();
    render(<AgentSection value={baseValue} onChange={onChange} />);

    fireEvent.click(screen.getByText("Ask me each time"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      auto_approve_tools: false,
    });
  });
});
