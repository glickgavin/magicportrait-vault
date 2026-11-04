import { env } from "@/lib/env";
import { claimWebhook, handleAgentMailEvent, verifySvix } from "@/lib/email/webhook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = env.optional("AGENTMAIL_WEBHOOK_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  const body = await req.text();
  const event = verifySvix(secret, body, req.headers);
  if (!event) return new Response("Invalid signature", { status: 401 });
  const id = req.headers.get("svix-id")!;
  if (!(await claimWebhook("agentmail", id, event.event_type ?? null))) return Response.json({ ok: true, duplicate: true });
  const r = await handleAgentMailEvent(event);
  return Response.json({ ok: true, ...r });
}
