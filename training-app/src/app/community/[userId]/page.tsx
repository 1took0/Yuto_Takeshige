import type { Metadata } from "next";
import { UserRecords } from "@/components/community/UserRecords";

export const metadata: Metadata = { title: "みんなの記録" };

export default async function CommunityUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserRecords userId={userId} />;
}
