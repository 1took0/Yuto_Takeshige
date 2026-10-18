import type { Metadata } from "next";
import { CommunityView } from "@/components/community/CommunityView";

export const metadata: Metadata = { title: "みんなの記録" };

export default function CommunityPage() {
  return <CommunityView />;
}
