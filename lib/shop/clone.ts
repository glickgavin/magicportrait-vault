import "server-only";
import { z } from "zod";
import { cloneEvents, type CloneEvent } from "@/lib/db/clones";
import { linkProduct, saveSync } from "@/lib/dreamship/link";
import { productRows, updateStoreFields } from "@/lib/open-store/admin";
import { getStoreCatalog } from "@/lib/open-store";
import { DreamshipError, getDreamship } from "@/lib/sources/dreamship";
import { track } from "@/lib/track";
import { copySettings } from "./copy";
import { COPY_PARTS } from "./copy-settings";
import { invalidateCatalog } from "./index";
import { getShopCatalogSource } from "./sources";

/**
 * Clone a product (docs/dreamship.md › Clone a product): a master product made by Dreamship is copied under a new
 * name with another Imagen theme. Two steps, because Dreamship lists the new product in Shopify on its own time:
 *
 * 1. Start: a new Dreamship product, a copy of the master's (same item, sizes, prices, artwork, shops), as a
 *    draft (CLAUDE.md allowed write 8).
 * 2. Finish, once Dreamship has listed it in Shopify: add it to the Magic Store collection (allowed write 9), copy
 *    the master's settings, set the theme, link it to its Dreamship product and fill in the print rules (write 5).
 *
 * The record of each clone is its events in `activity_log` (started, finished, dismissed): no table of its own.
 */

export type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const actorOpts = (email: string) => ({ email, actor: `super_user:${email}` as const });

export const cloneStartSchema = z.object({
  masterId: z.string().regex(/^\d{1,20}$/),
  name: z.string().trim().min(3, "Give the new product a name").max(120),
  theme: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,99}$/, "Choose an Imagen theme"),
});
export const cloneRefSchema = z.object({ dreamshipProductId: z.number().int().positive() });

export type PendingClone = { dreamshipProductId: number; masterId: string; name: string; theme: string; startedAt: string; by: string };

/** Clones started and not yet finished or dismissed (pure, from their events). */
export function pendingFrom(events: CloneEvent[]): PendingClone[] {
  const open = new Map<number, PendingClone>();
  for (const e of events) {
    const id = Number(e.props.dreamship_product_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (e.event === "admin_product_clone_started") open.set(id, { dreamshipProductId: id, masterId: String(e.props.master_product_id ?? ""), name: String(e.props.title ?? ""), theme: String(e.props.theme_slug ?? ""), startedAt: e.at, by: e.actor.replace(/^super_user:/, "") });
    else open.delete(id);
  }
  return [...open.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function pendingClones(): Promise<PendingClone[]> {
  return pendingFrom(await cloneEvents(new Date(Date.now() - 60 * 86_400_000)));
}

/** Step 1: the new Dreamship product. Nothing is written in Shopify by us here; Dreamship lists it as a draft. */
export async function startClone(actor: { email: string }, input: z.infer<typeof cloneStartSchema>): Promise<{ ok: true; dreamshipProductId: number } | Fail> {
  const all = await productRows();
  if (!all.ok) return fail(502, all.error);
  const master = all.rows.find((r) => r.product.legacyId === input.masterId);
  if (!master?.store) return fail(404, "The master must be a product in the Magic Store collection.");
  const masterDs = Number(master.product.dreamshipProductId);
  if (!masterDs) return fail(400, "The master isn't linked to its Dreamship product yet. Link it on its settings page first.");
  const theme = all.themes?.find((t) => t.slug === input.theme);
  if (all.themes && (!theme || !theme.active)) return fail(400, "Choose one of the Magic Store's active Imagen themes.");
  if (all.rows.some((r) => r.product.title.trim().toLowerCase() === input.name.trim().toLowerCase())) return fail(400, "A product with that name already exists. Choose another name.");
  if ((await pendingClones()).some((c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return fail(409, "A clone with that name is already being set up (see the list below).");
  try {
    const ds = await getDreamship();
    const source = await ds.cloneSource(masterDs);
    if (!source) return fail(404, "Dreamship has no product with the master's id.");
    if (!source.variants.length || !source.printAreas.length) return fail(422, "Dreamship didn't return the master's sizes or artwork, so it can't be copied.");
    if (!source.shopKeys.length) return fail(422, "The master isn't published to a shop in Dreamship, so the copy wouldn't reach Shopify.");
    const { id } = await ds.createProduct(source, input.name.trim());
    await track("admin_product_clone_started", { master_product_id: master.product.legacyId, dreamship_product_id: id, master_dreamship_product_id: masterDs, theme_slug: input.theme, title: input.name.trim() }, actorOpts(actor.email));
    return { ok: true, dreamshipProductId: id };
  } catch (e) {
    const m = e instanceof DreamshipError ? e.message : (e as Error).message;
    return fail(502, `Dreamship refused the new product (${m.slice(0, 160)}).`);
  }
}

export type FinishResult = { ok: true; state: "waiting"; detail: string } | { ok: true; state: "done"; productId: string; notes: string[] } | Fail;

/** Step 2: once Dreamship has listed the product in Shopify. Safe to run again: each part only fills what's missing. */
export async function finishClone(actor: { email: string }, input: z.infer<typeof cloneRefSchema>): Promise<FinishResult> {
  const clone = (await pendingClones()).find((c) => c.dreamshipProductId === input.dreamshipProductId);
  if (!clone) return fail(404, "That clone isn't waiting to be set up.");
  let listing;
  try {
    listing = await (await getDreamship()).shopifyIdOf(clone.dreamshipProductId);
  } catch (e) {
    return fail(502, `Couldn't read Dreamship (${(e as Error).message.slice(0, 120)}).`);
  }
  if (!listing) return fail(404, "Dreamship no longer has this product. Remove it from the list.");
  if (!listing.shopifyProductId) return { ok: true, state: "waiting", detail: listing.error ? `Dreamship couldn't publish it to Shopify (${listing.error}). Check it in Dreamship.` : "Dreamship is still publishing it to Shopify. Try again in a minute." };
  const gid = `gid://shopify/Product/${listing.shopifyProductId}`;

  const collection = (await getStoreCatalog({ fresh: true })).collection;
  if (!collection) return fail(502, "Couldn't read the Magic Store collection from Shopify.");
  const added = await (await getShopCatalogSource()).addToCollection(collection.id, gid);
  if (!added.ok) return fail(502, `Shopify refused to add it to the Magic Store collection (${added.reason}).`);
  await invalidateCatalog();

  const all = await productRows();
  if (!all.ok) return fail(502, all.error);
  const master = all.rows.find((r) => r.product.legacyId === clone.masterId);
  const made = all.rows.find((r) => r.product.id === gid);
  if (!made?.store) return { ok: true, state: "waiting", detail: "It's in Shopify and was added to the Magic Store collection; Shopify hasn't caught up yet. Try again in a minute." };

  const notes: string[] = [];
  if (!master) notes.push("The master is no longer in the store, so its settings weren't copied.");
  else {
    const c = await copySettings(actor, { from: master.product.id, to: gid, parts: [...COPY_PARTS] });
    if (!c.ok) notes.push(`Settings weren't all copied: ${c.error}`);
    else notes.push(...(c.skipped ?? []));
  }
  const themed = await updateStoreFields(actor, { productId: gid, fields: { imagen_theme: clone.theme }, variants: [] });
  if (!themed.ok) notes.push(`The Imagen theme wasn't set: ${themed.error}`);
  const linked = await linkProduct(actor, { productId: made.product.legacyId, dreamship: String(clone.dreamshipProductId) });
  if (!linked.ok) notes.push(`It wasn't linked to its Dreamship product: ${linked.error}`);
  else {
    const synced = await saveSync(actor, { productId: made.product.legacyId });
    if (!synced.ok) notes.push(`The print settings weren't filled in from Dreamship: ${synced.error}`);
  }
  await invalidateCatalog();
  await track("admin_product_clone_finished", { product_id: made.product.legacyId, dreamship_product_id: clone.dreamshipProductId, master_product_id: clone.masterId, theme_slug: clone.theme, notes: notes.length }, actorOpts(actor.email));
  return { ok: true, state: "done", productId: made.product.legacyId, notes };
}

/** Takes a clone off the list (it failed, or was deleted in Dreamship). Deletes nothing anywhere. */
export async function dismissClone(actor: { email: string }, input: z.infer<typeof cloneRefSchema>): Promise<{ ok: true } | Fail> {
  if (!(await pendingClones()).some((c) => c.dreamshipProductId === input.dreamshipProductId)) return fail(404, "That clone isn't on the list.");
  await track("admin_product_clone_dismissed", { dreamship_product_id: input.dreamshipProductId }, actorOpts(actor.email));
  return { ok: true };
}
