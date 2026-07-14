import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = id.length > 28 ? `${id.slice(0, 28)}...` : id;
  const title = `Agent ${short} | DEX8004 Explorer`;
  const og = `/api/og?title=${encodeURIComponent(`Agent ${short}`)}&subtitle=${encodeURIComponent(
    "ERC-8004 trust profile"
  )}`;

  return {
    title,
    description: "ERC-8004 agent profile with reviews, validations, verification status, and compliance checks.",
    openGraph: {
      title,
      description: "ERC-8004 agent profile with trust signals.",
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "ERC-8004 agent profile with trust signals.",
      images: [og],
    },
  };
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
