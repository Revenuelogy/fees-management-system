import { CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export function NoSession() {
  return (
    <Card>
      <Empty title="No academic session yet" icon={CalendarRange}>
        Create your first session (for example 2026-27, April to March) with its installments, then add classes, fee heads
        and the fee structure.
        <div className="mt-4">
          <LinkButton href="/setup" variant="primary">
            Open setup checklist
          </LinkButton>
        </div>
      </Empty>
    </Card>
  );
}
