import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { classFeeLines } from "@/server/services/analytics";
import { id, optionalText } from "@/server/validate";

const Query = z.object({
  session: id("Choose a session."),
  installment: id("Unknown installment.").nullish(),
  fee_head: id("Unknown fee type.").nullish(),
  section: optionalText(10),
});

/** Every student of a class with what they must pay, have paid and have left for one installment or fee type. */
export const GET = api<{ id: string }>("staff", async ({ req, params, viewer }) => {
  const q = readQuery(req, Query);
  return classFeeLines(viewer, q.session, pathParam(id(), params.id), {
    installmentId: q.installment ?? null,
    feeHeadId: q.fee_head ?? null,
    section: q.section,
  });
});
