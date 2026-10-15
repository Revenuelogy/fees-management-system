"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Share the one-page summary as text over WhatsApp or email, or copy it. */
export function ShareSummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-4 text-subhead font-medium text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]"
      >
        <MessageCircle className="size-4" /> WhatsApp
      </a>
      <a
        href={`mailto:?subject=${encodeURIComponent("Fee summary")}&body=${encodeURIComponent(text.replace(/\*/g, ""))}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-4 text-subhead font-medium text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]"
      >
        <Mail className="size-4" /> Email
      </a>
      <Button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy text"}
      </Button>
    </>
  );
}
