import { requireUser } from "@/lib/auth/session";
import { findOwnedOrder } from "@/lib/redeem/access";
import { OrderNotFound } from "@/components/screens/OrderNotFound";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ orderName: string }> }) {
  const { orderName } = await params;
  const user = await requireUser(`/orders/${orderName}`);
  const order = await findOwnedOrder(user.email, decodeURIComponent(orderName));
  if (!order) return <OrderNotFound />;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[26px] font-extrabold">Order {order.name}</h1>
    </div>
  );
}
