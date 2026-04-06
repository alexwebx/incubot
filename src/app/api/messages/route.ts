import { NextResponse } from "next/server";
import type { Message } from "@/lib/messages";
import { requireUser, unauthorizedResponse } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export async function GET() {
  try {
    await requireUser();

    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .select("id, telegram_chat_id, username, first_name, last_name, text, created_at, direction")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ messages: (data ?? []) as Message[] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load messages" },
      { status: 500 },
    );
  }
}
