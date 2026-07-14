import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentImage } from "@/components/agents/agent-image";

describe("AgentImage", () => {
  it("rotates IPFS gateways before showing a deterministic placeholder", () => {
    render(<AgentImage src="ipfs://bafy-image" alt="Sample Agent" className="h-10 w-10" />);

    const first = screen.getByRole("img", { name: "Sample Agent" });
    expect(first).toHaveAttribute("src", "https://cdn.kleros.link/ipfs/bafy-image");
    fireEvent.error(first);
    expect(screen.getByRole("img", { name: "Sample Agent" })).toHaveAttribute(
      "src",
      "https://ipfs.io/ipfs/bafy-image"
    );
    fireEvent.error(screen.getByRole("img", { name: "Sample Agent" }));
    expect(screen.getByRole("img", { name: "Sample Agent" })).toHaveAttribute(
      "src",
      "https://gateway.pinata.cloud/ipfs/bafy-image"
    );
    fireEvent.error(screen.getByRole("img", { name: "Sample Agent" }));

    expect(screen.getByRole("img", { name: "Sample Agent" })).toHaveTextContent("SA");
  });
});
