import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "ERC-8004 Agent";
  const subtitle = searchParams.get("subtitle") || "Trust-aware discovery";
  const network = searchParams.get("network") || "multi-chain";
  const quality = searchParams.get("quality") || "-";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(135deg, #02050a 0%, #050b14 55%, #09111b 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 28, fontWeight: 700 }}>
          <span style={{ color: "#67e8f9" }}>K</span>
          <span style={{ color: "rgba(255,255,255,0.9)" }}>SCORE Explorer</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 800, maxWidth: 980 }}>{title}</div>
          <div style={{ fontSize: 30, opacity: 0.85 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 26, opacity: 0.92 }}>
          <div>Network: {network}</div>
          <div>Quality: {quality}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
