import { NextResponse } from "next/server";
import { requireUser, unauthorizedResponse, forbiddenResponse } from "@/lib/server/auth";
import { createOutgoingMessage, ensureDialogAccess, findDialogById } from "@/lib/server/dialogs";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type RouteContext = {
  params: Promise<{
    dialogId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { dialogId } = await context.params;
    const dialog = await findDialogById(dialogId);

    if (!dialog) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }

    const { text } = (await request.json()) as { text?: string };
    const trimmedText = text?.trim();

    if (!trimmedText) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!telegramBotToken) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is required" }, { status: 500 });
    }

    await ensureDialogAccess(dialogId, user);

    const { data: client, error: clientError } = await getSupabaseAdmin()
      .from("clients")
      .select("telegram_chat_id")
      .eq("id", dialog.client_id)
      .single<{ telegram_chat_id: string }>();

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    const sendResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: client.telegram_chat_id,
        text: trimmedText,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();

      return NextResponse.json(
        { error: `Telegram sendMessage failed: ${errorText}` },
        { status: 502 },
      );
    }

    const message = await createOutgoingMessage(dialogId, user, trimmedText);

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
