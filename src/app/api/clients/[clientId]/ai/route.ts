import { NextResponse } from "next/server";
import { forbiddenResponse, requireUser, unauthorizedResponse } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();

    if (user.role !== "admin") {
      return forbiddenResponse();
    }

    const { clientId } = await context.params;
    const payload = (await request.json()) as { aiEnabled?: boolean };

    if (typeof payload.aiEnabled !== "boolean") {
      return NextResponse.json({ error: "aiEnabled is required" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("clients")
      .update({ ai_enabled: payload.aiEnabled })
      .eq("id", clientId)
      .select(
        "id, telegram_user_id, telegram_chat_id, username, first_name, last_name, ai_enabled, created_at, updated_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ client: data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update client AI setting" },
      { status: 500 },
    );
  }
}
