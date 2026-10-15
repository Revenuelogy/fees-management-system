"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print", variant = "secondary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
