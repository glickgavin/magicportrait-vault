/** Three sample card thumbnails fanned out (static images, cheap for home). */
const PICKS = [
  ["birthday-confetti", -8, "translate-y-3"],
  ["christmas-snowfall", 0, "z-10 -translate-y-1"],
  ["new-year-champagne", 8, "translate-y-3"],
] as const;

export function CardFanStatic({ locked }: { locked?: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[300px] items-end justify-center" aria-hidden={locked ? undefined : true}>
      {PICKS.map(([file, rot, cls]) => (
        <img
          key={file}
          src={`/theme-placeholders/thumbs/${file}.jpg`}
          alt=""
          width={300}
          height={420}
          className={`-mx-2 w-[34%] rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.14)] ${cls}`}
          style={{ transform: `rotate(${rot}deg)` }}
        />
      ))}
      {locked}
    </div>
  );
}
