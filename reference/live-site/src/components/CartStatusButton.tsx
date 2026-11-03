import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useFunnelStore } from '@/stores/funnelStore';
import { BASKET_SEED_LIMIT } from '@/lib/benefitThresholds';
import { stripLang } from '@/lib/langRoutes';
import { cn } from '@/lib/utils';

const HANDOFF_KEY = 'lptemp_handoff';
const SESSION_KEY = 'lptemp_session_id';
const ORDER_PATH = '/order?product_id=8471707222212&magicid=999';

interface HandoffImageLite {
  image_id: string;
  imagegen_session_id?: string;
  kind?: 'tile' | 'masterpiece';
}

/**
 * Images generated this session, from the /order handoff. Empty when nothing
 * has been generated yet.
 */
function readHandoffImages(): HandoffImageLite[] {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Masterpiece versions are never auto-added on /order — they only join
    // the order when "Add to order" is tapped on Customize (store.masterpiece).
    // Keep them out of the tile forecast.
    return Array.isArray(parsed?.images)
      ? (parsed.images as HandoffImageLite[]).filter((im) => im.kind !== 'masterpiece')
      : [];
  } catch {
    return [];
  }
}

/**
 * What /order WILL seed from these images if it hasn't run yet: the seed
 * limit applied per batch, mirroring OrderReview's seeding effect. Only used
 * until /order publishes its real count.
 */
function estimateSeededCount(images: HandoffImageLite[]): number {
  const batches = new Map<string, number>();
  for (const img of images) {
    const key = img.imagegen_session_id || '';
    batches.set(key, (batches.get(key) ?? 0) + 1);
  }
  let n = 0;
  batches.forEach((size) => { n += Math.min(size, BASKET_SEED_LIMIT); });
  return n;
}

/**
 * Header bag. Three states:
 *  - greyed:          nothing generated this session
 *  - active + badge:  generated; badge = /order's live tile count once it has
 *                     published, otherwise the per-batch seed estimate
 *
 * The Shopify cart is NOT consulted: /order only writes tiles to the cart on
 * Place order, so cart lines are empty during review.
 */
export function CartStatusButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const published = useFunnelStore((s) => s.activeTileCount);

  // A masterpiece is "in the order" once Customize's Add to order has stored
  // its variant; it counts as one item.
  const masterpieceCount = useFunnelStore((s) => (s.masterpiece?.variantId ? 1 : 0));

  const images = readHandoffImages();
  const generated = images.length > 0;
  const tileCount = useMemo(
    () => (published >= 0 ? published : (generated ? estimateSeededCount(images) : 0)) + masterpieceCount,
    // images is re-read each render; its length is the stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [published, generated, images.length, masterpieceCount],
  );

  const active = generated || tileCount > 0;
  const onOrderPage = stripLang(location.pathname) === '/order';

  const goToOrder = () => {
    if (!active || onOrderPage) return;
    const sid = sessionStorage.getItem(SESSION_KEY);
    navigate(sid ? `${ORDER_PATH}&session=${sid}` : ORDER_PATH);
  };

  return (
    <button
      type="button"
      onClick={goToOrder}
      aria-disabled={!active}
      aria-label={tileCount > 0 ? `Your order, ${tileCount} items` : 'Your order'}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-full transition-opacity',
        active ? 'text-foreground hover:bg-[rgba(0,0,0,0.05)]' : 'text-foreground opacity-40 cursor-default',
        onOrderPage && 'cursor-default',
      )}
    >
      <ShoppingBag className="h-5 w-5" strokeWidth={2} />
      {tileCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white"
          style={{ background: 'var(--primary-gradient)' }}
        >
          {tileCount}
        </span>
      )}
    </button>
  );
}

export default CartStatusButton;
