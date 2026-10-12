import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names; later Tailwind classes win (the standard shadcn/ui helper). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}