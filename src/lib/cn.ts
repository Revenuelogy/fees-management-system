import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom @theme tokens in globals.css, so `text-title1` is read as a font size
// (not a colour that would cancel `text-ink`) and `shadow-card` as a shadow.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "large", "title1", "title2", "title3", "headline", "body", "subhead", "footnote", "caption"],
      shadow: ["card", "pop"],
      radius: ["card"],
    },
  },
});

/** Join class names; later classes win over earlier conflicting ones (e.g. a caller's `px-2` over a base `px-4`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
