import "server-only";
import type { z } from "zod";
import type { Viewer } from "@/server/auth/session";
import { audit, read, write } from "@/server/data";
import type { Db } from "@/server/db";
import { badRequest, notFound } from "@/server/http";
import type { CampaignFields, ParticipantPatch, ParticipantsBody } from "@/server/schemas/recovery";
import { orNotFound } from "@/server/services/analytics";
import type { CampaignDetail, CampaignKind, RecoveryCampaign, RecoveryOverview, StudentRecovery } from "@/lib/types";

// Fee recovery campaigns: call campaigns (the call list and its results) and student activities (participants,
// their response and the receipts credited to the activity). Figures come from the SQL functions in
// db/migrations/*_recovery.sql.

export type CampaignInput = z.output<typeof CampaignFields>;

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export function overview(viewer: Viewer) {
  return read(viewer, "recovery", [], (db) => db.rpc<RecoveryOverview>("recovery_overview"));
}

/** Campaigns without their figures (pickers), newest first; `active` = only running ones. */
export function campaigns(viewer: Viewer, active: boolean) {
  return read(viewer, "campaigns", [active], (db) =>
    db.query<RecoveryCampaign>(
      `select * from public.recovery_campaigns where not $1 or status = 'active' order by start_date desc, created_at desc`,
      [active],
    ),
  );
}

export function campaign(viewer: Viewer, id: string) {
  return orNotFound(
    read(viewer, "campaign", [id], (db) => db.rpc<CampaignDetail>("campaign_detail", { p_campaign: id })),
    /^Campaign not found/,
    "That campaign does not exist.",
  );
}

/** A student's family, the latest calls to it and the activities the student is part of. */
export function studentRecovery(viewer: Viewer, studentId: string) {
  return orNotFound(
    read(viewer, "student-recovery", [studentId], (db) => db.rpc<StudentRecovery>("student_recovery", { p_student: studentId })),
    /^Student not found/,
    "That student does not exist.",
  );
}

// ---------------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------------

const SETTINGS = [
  "name", "description", "start_date", "end_date", "status", "target_amount", "class_ids", "min_due", "silent_days", "high_due",
  "include_old_dues", "include_broken", "recall_days",
] as const;

/** Create a campaign; an activity can start with `studentIds` taking part (all in one transaction). */
export async function createCampaign(viewer: Viewer, kind: CampaignKind, c: CampaignInput, studentIds: string[] = []) {
  return write(viewer, async (db) => {
    const row = await db.one<{ id: string }>(
      `insert into public.recovery_campaigns (kind, ${SETTINGS.join(", ")})
       values ($1, ${SETTINGS.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
      [kind, ...SETTINGS.map((f) => c[f])],
    );
    const added = studentIds.length ? await addToActivity(db, row!.id, { studentIds }) : 0;
    if (added < studentIds.length) throw notFound("That student does not exist.");
    await audit(db, "create_campaign", "recovery_campaigns", row!.id, { kind, name: c.name, students: added });
    return { id: row!.id, message: kind === "activity" ? `“${c.name}” created.` : `“${c.name}” started.` };
  });
}

export async function updateCampaign(viewer: Viewer, id: string, c: CampaignInput) {
  return write(viewer, async (db) => {
    const row = await db.one<{ id: string }>(
      `update public.recovery_campaigns set ${SETTINGS.map((f, i) => `${f} = $${i + 2}`).join(", ")} where id = $1 returning id`,
      [id, ...SETTINGS.map((f) => c[f])],
    );
    if (!row) throw notFound("This campaign no longer exists.");
    await audit(db, "update_campaign", "recovery_campaigns", id, { name: c.name, status: c.status });
    return { message: c.status === "closed" ? "Saved. The campaign is closed." : "Saved." };
  });
}

/** Delete a campaign with no calls and no credited receipts (otherwise close it, so its results stay). */
export async function deleteCampaign(viewer: Viewer, id: string) {
  await write(viewer, async (db) => {
    const c = await db.one<{ name: string; kind: string }>("select name, kind from public.recovery_campaigns where id = $1", [id]);
    if (!c) throw notFound("This campaign no longer exists.");
    const calls = await db.count("select 1 from public.parent_calls where campaign_id = $1", [id]);
    const credits = await db.count(
      "select 1 from public.recovery_credits rc join public.recovery_participants rp on rp.id = rc.participant_id where rp.campaign_id = $1",
      [id],
    );
    if (calls > 0 || credits > 0) throw badRequest("This campaign already has calls or credited receipts. Close it instead, so its results are kept.");
    await db.query("delete from public.recovery_campaigns where id = $1", [id]);
    await audit(db, "delete_campaign", "recovery_campaigns", id, c);
  });
}

// ---------------------------------------------------------------------------------------------
// Activities: participants, responses and credited receipts
// ---------------------------------------------------------------------------------------------

/**
 * add_activity_participants() takes the students as uuid[]; db.rpc() sends JS arrays as jsonb, so this calls it
 * with an explicit cast (pg sends a JS array as a Postgres array).
 */
async function addToActivity(
  db: Db,
  campaignId: string,
  o: { studentIds: string[]; classId?: string | null; section?: string | null; onlyDues?: boolean },
) {
  const row = await db.one<{ n: number }>(
    `select public.add_activity_participants(p_campaign => $1, p_students => $2::uuid[], p_class => $3, p_section => $4,
                                             p_only_dues => $5) as n`,
    [campaignId, o.studentIds.length ? o.studentIds : null, o.classId ?? null, o.section ?? null, o.onlyDues ?? false],
  );
  return Number(row?.n ?? 0);
}

export async function addParticipants(viewer: Viewer, campaignId: string, p: z.output<typeof ParticipantsBody>) {
  const n = await orNotFound(
    write(viewer, (db) => addToActivity(db, campaignId, { studentIds: p.student_ids, classId: p.class_id, section: p.section, onlyDues: p.only_with_dues })),
    /^Campaign not found/,
    "That activity does not exist.",
  );
  return {
    message: n === 0 ? "No new students: they are already in the activity (or none matched)." : `${n} ${n === 1 ? "student" : "students"} added.`,
  };
}

export async function updateParticipant(viewer: Viewer, id: string, p: z.output<typeof ParticipantPatch>) {
  await write(viewer, async (db) => {
    const row = await db.one(
      `update public.recovery_participants
          set response = $2, note = $3, updated_by = public.current_user_id(), updated_at = now()
        where id = $1 returning id`,
      [id, p.response, p.note],
    );
    if (!row) throw notFound("This participant is no longer in the activity.");
  });
  return { message: "Saved." };
}

export async function removeParticipant(viewer: Viewer, id: string) {
  await write(viewer, async (db) => {
    const row = await db.one<{ campaign_id: string; student_id: string }>(
      "delete from public.recovery_participants where id = $1 returning campaign_id, student_id",
      [id],
    );
    if (!row) throw notFound("This participant is no longer in the activity.");
    await audit(db, "remove_participant", "recovery_participants", id, row);
  });
}

/** Count a receipt as paid because of the activity. */
export async function credit(viewer: Viewer, participantId: string, paymentId: string) {
  await orNotFound(
    write(viewer, (db) => db.rpc("credit_recovery_payment", { p_participant: participantId, p_payment: paymentId })),
    /^(Participant|Payment) not found/,
    "That participant or receipt does not exist.",
  );
  return { message: "Receipt counted for the activity." };
}

export async function uncredit(viewer: Viewer, paymentId: string) {
  await write(viewer, async (db) => {
    const row = await db.one<{ participant_id: string }>("delete from public.recovery_credits where payment_id = $1 returning participant_id", [paymentId]);
    if (!row) throw notFound("That receipt is not counted for an activity.");
    await audit(db, "uncredit_recovery", "recovery_credits", paymentId, row);
  });
  return { message: "Receipt no longer counted for the activity." };
}
