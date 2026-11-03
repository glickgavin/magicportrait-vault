import "server-only";
import { listSettings } from "@/lib/settings";
import { db } from "@/lib/db/client";
import type { TableRow } from "@/components/admin/SettingsTable";

export async function settingRows(): Promise<TableRow[]> {
  return (await listSettings()).map((r) => ({
    key: r.key,
    type: r.type,
    value: r.value,
    options: r.options,
    readOnly: r.readOnly,
    label: r.label,
    description: r.description,
    section: r.section,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }));
}

export async function superUsers() {
  return ((await db().from("super_users").select("email, added_by, created_at").order("created_at")).data ?? []) as { email: string; added_by: string; created_at: string }[];
}

export async function recentAdminChanges(limit = 8) {
  return ((await db().from("activity_log").select("id, occurred_at, event, ref_id, actor").like("actor", "super_user:%").order("occurred_at", { ascending: false }).limit(limit)).data ?? []) as { id: number; occurred_at: string; event: string; ref_id: string | null; actor: string }[];
}
