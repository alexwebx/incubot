import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number | string;
      username?: string;
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    message_id?: number;
  };
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY is not set");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  messageId?: number,
) {
  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: messageId,
      }),
    },
  );

  if (!response.ok) {
    const telegramError = await response.text();
    throw new Error(`Telegram sendMessage failed: ${telegramError}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  let update: TelegramUpdate;

  try {
    update = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;
  const firstName = update.message?.from?.first_name ?? null;
  const lastName = update.message?.from?.last_name ?? null;
  const username =
    update.message?.from?.username ?? update.message?.chat?.username ?? null;
  const text = update.message?.text ?? null;
  const trimmedText = text?.trim() ?? "";

  if (!chatId) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "No message.chat.id in update",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/i.test(trimmedText);

  if (isStartCommand) {
    try {
      await sendTelegramMessage(
        chatId,
        firstName
          ? `Привет, ${firstName}. Отправь сообщение, и я сохраню его в базу.`
          : "Привет. Отправь сообщение, и я сохраню его в базу.",
        messageId,
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("messages").insert({
    telegram_chat_id: String(chatId),
    username,
    first_name: firstName,
    last_name: lastName,
    text,
  });

  if (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const replyText = firstName
    ? `Принято, ${firstName}. Сообщение сохранено.`
    : "Принято. Сообщение сохранено.";

  try {
    await sendTelegramMessage(chatId, replyText, messageId);
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
