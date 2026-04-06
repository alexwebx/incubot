import { NextResponse } from "next/server";
import type { Message } from "@/lib/messages";
import { requireUser, unauthorizedResponse } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type SendMessagePayload = {
  telegram_chat_id?: string;
  text?: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
  }

  let payload: SendMessagePayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramChatId = payload.telegram_chat_id?.trim();
  const text = payload.text?.trim();
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!telegramBotToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is required" }, { status: 500 });
  }

  if (!telegramChatId || !text) {
    return NextResponse.json(
      { error: "telegram_chat_id and text are required" },
      { status: 400 },
    );
  }

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
      }),
    },
  );

  if (!telegramResponse.ok) {
    const errorText = await telegramResponse.text();

    return NextResponse.json(
      { error: `Telegram sendMessage failed: ${errorText}` },
      { status: 502 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .insert({
      telegram_chat_id: telegramChatId,
      username: payload.username ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      text,
      direction: "outgoing",
    })
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at, direction")
    .single<Message>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
