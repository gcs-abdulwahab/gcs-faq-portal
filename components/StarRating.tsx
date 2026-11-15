import { Star } from "lucide-react";

export function StarRating({ stars, className = "" }: { stars: number; className?: string }) {
  const label = stars === 0 ? "Not opened yet" : `Popularity: ${stars} out of 5`;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} title={label} aria-label={label} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= stars ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300"}`}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

// Same rule as the faq_star_ratings() database function.
export function starsFromViews(views: number, maxViews: number) {
  if (views <= 0) return 0;
  return Math.max(1, Math.ceil((5 * views) / Math.max(maxViews, 1)));
}
