import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/messages";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type SendMessagePayload = {
  telegram_chat_id?: string;
  text?: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export async function POST(request: Request) {
  let payload: SendMessagePayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramChatId = payload.telegram_chat_id?.trim();
  const text = payload.text?.trim();

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

  const { data, error } = await supabase
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
