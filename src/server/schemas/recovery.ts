import "server-only";
import { z } from "zod";
import { ATTITUDES, BEHAVIOURS, ECONOMIC, OUTCOMES, PARTICIPANT_RESPONSES, PICKED_BY, RELATIONS, RESPONSES, phoneDigits } from "@/lib/recovery";
import { EMAIL_RE, id, isoDate, optionalDate, optionalText, paise, requiredText } from "@/server/validate";

const PHONE = "Enter a phone number with 6 to 15 digits.";

/** A phone number as typed; the database stores its digits (normalize_phone). */
const phone = () =>
  z
    .string({ error: PHONE })
    .trim()
    .max(50, PHONE)
    .refine((v) => phoneDigits(v) !== null, PHONE);

const optionalPhone = () => optionalText(50).refine((v) => v === null || phoneDigits(v) !== null, "The alternate phone number does not look right.");

/** Optional choice from a list; empty becomes null. */
const choice = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z
    .union([z.enum(values, { error: message }), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null) as T[number] | null);

export const ParentFields = z.object({
  name: requiredText("Enter the parent's name.", 200),
  phone: phone(),
  relation: z.enum(RELATIONS, { error: "Choose how they are related to the children." }).default("father"),
  alt_phone: optionalPhone(),
  email: optionalText(254).refine((v) => v === null || EMAIL_RE.test(v), "The email address does not look right."),
  address: optionalText(1000),
  occupation: optionalText(200),
  economic_status: choice(ECONOMIC, "Choose an economic condition from the list."),
  payment_behaviour: choice(BEHAVIOURS, "Choose a payment habit from the list."),
  attitude: choice(ATTITUDES, "Choose how they deal with the school from the list."),
  best_time_to_call: optionalText(200),
  concerns: optionalText(2000),
  priorities: optionalText(2000),
  behaviour_notes: optionalText(4000),
  remarks: optionalText(2000),
});

export const ParentUpdateBody = ParentFields.extend({
  /** when the phone number changes, give the children (who have the old number) the new one too */
  update_children_phone: z.boolean().default(true),
});

export const CallBody = z
  .object({
    campaign_id: id("Unknown campaign.")
      .nullish()
      .transform((v) => v ?? null),
    call_date: optionalDate("Enter the date of the call."),
    outcome: z.enum(OUTCOMES, { error: "Choose whether the call got through." }),
    picked_by: choice(PICKED_BY, "Choose who picked up."),
    response: choice(RESPONSES, "Choose what they said."),
    summary: optionalText(2000),
    promised_date: optionalDate("The promised date is not a valid date."),
    promised_amount: paise("The promised amount is not a valid rupee amount.")
      .positive("The promised amount is not a valid rupee amount.")
      .nullish()
      .transform((v) => v ?? null),
    follow_up_on: optionalDate("The next call date is not a valid date."),
  })
  .refine((b) => b.promised_amount === null || b.promised_date !== null, "Enter the date they promised to pay by.");

const days = (message: string, max: number) => z.number({ error: message }).int(message).min(1, message).max(max, message);

const CampaignBase = z.object({
  name: requiredText("Give it a name.", 200),
  description: optionalText(2000),
  start_date: isoDate("Enter the start date."),
  end_date: optionalDate("The end date is not a valid date."),
  status: z.enum(["active", "closed"]).default("active"),
  target_amount: paise("The target is not a valid rupee amount.")
    .positive("The target is not a valid rupee amount.")
    .nullish()
    .transform((v) => v ?? null),
  class_ids: z.array(id("Choose a valid class.")).max(100).default([]),
  min_due: paise("The minimum due is not a valid rupee amount.").positive("The minimum due must be more than ₹0.").default(100),
  silent_days: days("Days without payment must be between 1 and 730.", 730).nullable().default(60),
  high_due: paise("The big-dues limit is not a valid rupee amount.").positive("The big-dues limit must be more than ₹0.").nullable().default(2000000),
  include_old_dues: z.boolean().default(true),
  include_broken: z.boolean().default(true),
  recall_days: days("Days between calls must be between 1 and 90.", 90).default(7),
});

const endAfterStart = (b: { start_date: string; end_date: string | null }) => b.end_date === null || b.end_date >= b.start_date;
const END_BEFORE_START = "The end date cannot be before the start date.";

export const CampaignFields = CampaignBase.refine(endAfterStart, END_BEFORE_START);

export const CampaignCreateBody = CampaignBase.extend({
  kind: z.enum(["calls", "activity"], { error: "Choose calls or an activity." }),
}).refine(endAfterStart, END_BEFORE_START);

export const ParticipantsBody = z
  .object({
    student_ids: z.array(id("Unknown student.")).max(500).default([]),
    class_id: id("Choose a valid class.")
      .nullish()
      .transform((v) => v ?? null),
    section: optionalText(10),
    only_with_dues: z.boolean().default(false),
  })
  .refine((b) => b.class_id !== null || b.student_ids.length > 0, "Choose a class or at least one student.");

export const ParticipantPatch = z.object({
  response: z.enum(PARTICIPANT_RESPONSES, { error: "Choose a response." }),
  note: optionalText(1000),
});
