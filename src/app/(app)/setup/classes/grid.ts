// Shared by the server page (header row) and the client rows. Kept out of the "use client" module so the
// server component receives the string itself rather than a client reference.
// name | order/priority | active | actions
export const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_5.75rem]";
