import { describe, expect, it } from "vitest";
import { cloneStartSchema, pendingFrom } from "@/lib/shop/clone";

// Clone a product (docs/dreamship.md › Clone a product): the list of clones still being set up, from their events.

const ev = (event: string, at: string, props: Record<string, unknown>) => ({ event, at, props, actor: "super_user:super@example.com" });

describe("clones being set up", () => {
  it("are the ones started and not yet finished or dismissed, newest first", () => {
    const list = pendingFrom([
      ev("admin_product_clone_started", "2026-11-26T10:00:00Z", { dreamship_product_id: 1, master_product_id: "8710000000", theme_slug: "admiral-01", title: "One" }),
      ev("admin_product_clone_started", "2026-11-26T11:00:00Z", { dreamship_product_id: 2, master_product_id: "8710000000", theme_slug: "royal-01", title: "Two" }),
      ev("admin_product_clone_started", "2026-11-26T12:00:00Z", { dreamship_product_id: 3, master_product_id: "8710000000", theme_slug: "mona-01", title: "Three" }),
      ev("admin_product_clone_finished", "2026-11-26T12:30:00Z", { dreamship_product_id: 1 }),
      ev("admin_product_clone_dismissed", "2026-11-26T12:40:00Z", { dreamship_product_id: 3 }),
      ev("admin_product_clone_started", "2026-11-26T13:00:00Z", { dreamship_product_id: "nope" }),
    ]);
    expect(list).toEqual([{ dreamshipProductId: 2, masterId: "8710000000", name: "Two", theme: "royal-01", startedAt: "2026-11-26T11:00:00Z", by: "super@example.com" }]);
  });

  it("the form needs a master, a name and a theme slug", () => {
    expect(cloneStartSchema.safeParse({ masterId: "8710000000", name: 'Framed Print "Watercolor"', theme: "watercolor-01" }).success).toBe(true);
    expect(cloneStartSchema.safeParse({ masterId: "8710000000", name: "ab", theme: "watercolor-01" }).success).toBe(false);
    expect(cloneStartSchema.safeParse({ masterId: "x", name: "A name", theme: "watercolor-01" }).success).toBe(false);
    expect(cloneStartSchema.safeParse({ masterId: "1", name: "A name", theme: "Not A Slug" }).success).toBe(false);
  });
});
