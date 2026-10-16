import "server-only";
import { z } from "zod";
import { EMAIL_RE, id, optionalDate, optionalText, requiredText } from "@/server/validate";

export const StudentFields = z.object({
  admission_no: requiredText("Enter the admission number.", 100),
  full_name: requiredText("Enter the student's full name.", 200),
  father_name: optionalText(200),
  mother_name: optionalText(200),
  phone: optionalText(50),
  alt_phone: optionalText(50),
  email: optionalText(254).refine((v) => v === null || EMAIL_RE.test(v), "The email address does not look right."),
  dob: optionalDate("Date of birth is not a valid date."),
  gender: z
    .enum(["M", "F", "O"])
    .nullish()
    .transform((v) => v ?? null),
  address: optionalText(1000),
  admission_date: optionalDate("Admission date is not a valid date."),
  remarks: optionalText(2000),
});

/** Class in a session (null = do not enrol / leave the enrolment alone). */
export const Enrolment = z
  .object({
    session_id: id("There is no academic session to enrol the student in."),
    class_id: id("Choose a valid class."),
    section: z
      .string()
      .trim()
      .max(10, "Keep the section under 10 characters.")
      .transform((v) => v || "A"),
    roll_no: optionalText(20),
    generate: z.boolean().default(true),
  })
  .nullable();

export const StudentBody = z.object({ student: StudentFields, enrolment: Enrolment });
