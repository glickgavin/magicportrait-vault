import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getOwnedCard } from "@/lib/db/cards";
import { Creating } from "@/components/builder/Creating";

export const dynamic = "force-dynamic";

export default async function CreatingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ first?: string }> }) {
  const { id } = await params;
  const user = await requireUser("/cards");
  const card = await getOwnedCard(user.email, id);
  if (!card) notFound();
  return <Creating cardId={card.id} firstCard={(await searchParams).first === "1"} />;
}
