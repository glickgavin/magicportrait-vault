import { getSetting } from "@/lib/settings";

/** Where each of the three cards sits: tilt and lift (the middle one in front). */
const SPOTS = [
  [-8, "translate-y-3"],
  [0, "z-10 -translate-y-1"],
  [8, "translate-y-3"],
] as const;

/**
 * Three finished sample cards fanned out (links.sample_cards): the sign-in page and home. Plain images, so it's
 * cheap; `locked` lays something over the middle (the lock on a creator's home).
 */
export async function CardFanStatic({ locked, label }: { locked?: React.ReactNode; label?: string }) {
  const images = (await getSetting("links.sample_cards")).slice(0, 3);
  return (
    <div
      className="relative mx-auto flex w-full max-w-[330px] items-end justify-center"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": locked ? undefined : true })}
      data-testid="sample-cards"
    >
      {images.map((src, i) => {
        const [rot, cls] = SPOTS[i] ?? SPOTS[1];
        return (
          <img
            key={`${i}-${src}`}
            src={src}
            alt=""
            width={480}
            height={672}
            loading={i === 1 ? "eager" : "lazy"}
            className={`-mx-2 aspect-[5/7] w-[35%] rounded-[6px] bg-white object-cover shadow-[0_10px_28px_rgba(0,0,0,0.18)] ${cls}`}
            style={{ transform: `rotate(${rot}deg)` }}
          />
        );
      })}
      {locked}
    </div>
  );
}
