import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  await requireUser("/create");
  return <h1 className="text-[26px] font-extrabold">Create a card</h1>;
}
