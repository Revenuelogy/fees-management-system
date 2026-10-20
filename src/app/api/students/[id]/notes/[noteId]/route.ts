import { api, pathParam } from "@/server/http";
import { deleteNote } from "@/server/services/students";
import { id } from "@/server/validate";

export const DELETE = api<{ id: string; noteId: string }>("writer", async ({ params, viewer }) =>
  deleteNote(viewer, pathParam(id(), params.id), pathParam(id(), params.noteId)),
);
