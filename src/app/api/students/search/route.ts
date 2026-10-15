import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 12);
  if (q.length < 1) return NextResponse.json([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_students", { p_query: q, p_limit: Math.min(Math.max(limit, 1), 50) });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.json(data ?? []);
}
