import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number | string;
      username?: string;
    };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    message_id?: number;
  };
};

type ClientRow = {
  id: string;
  telegram_chat_id: string;
};

type DialogRow = {
  id: string;
  client_id: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: messageId,
    }),
  });

  if (!response.ok) {
    const telegramError = await response.text();
    throw new Error(`Telegram sendMessage failed: ${telegramError}`);
  }
}

async function upsertClient(input: {
  telegramUserId?: number;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        telegram_user_id: input.telegramUserId ?? null,
        telegram_chat_id: input.telegramChatId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      },
      { onConflict: "telegram_chat_id" },
    )
    .select("id, telegram_chat_id")
    .single<ClientRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findOrCreateOpenDialog(clientId: string) {
  const { data: existingDialog, error: existingDialogError } = await supabase
    .from("dialogs")
    .select("id, client_id")
    .eq("client_id", clientId)
    .eq("status", "open")
    .maybeSingle<DialogRow>();

  if (existingDialogError) {
    throw new Error(existingDialogError.message);
  }

  if (existingDialog) {
    return existingDialog;
  }

  const now = new Date().toISOString();
  const { data: createdDialog, error: createDialogError } = await supabase
    .from("dialogs")
    .insert({
      client_id: clientId,
      status: "open",
      created_at: now,
      updated_at: now,
    })
    .select("id, client_id")
    .single<DialogRow>();

  if (createDialogError) {
    throw new Error(createDialogError.message);
  }

  return createdDialog;
}

async function storeIncomingMessage(input: {
  telegramUserId?: number;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  text: string;
}) {
  const client = await upsertClient(input);
  const dialog = await findOrCreateOpenDialog(client.id);
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("messages").insert({
    dialog_id: dialog.id,
    client_id: client.id,
    manager_id: null,
    sender_type: "client",
    text: input.text,
    created_at: now,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateDialogError } = await supabase
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", dialog.id);

  if (updateDialogError) {
    throw new Error(updateDialogError.message);
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
  const telegramUserId = update.message?.from?.id;
  const firstName = update.message?.from?.first_name ?? null;
  const lastName = update.message?.from?.last_name ?? null;
  const username = update.message?.from?.username ?? update.message?.chat?.username ?? null;
  const text = update.message?.text ?? "";
  const trimmedText = text.trim();

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
          ? `Привет, ${firstName}. Отправь сообщение, и я передам его менеджеру.`
          : "Привет. Отправь сообщение, и я передам его менеджеру.",
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

  try {
    await storeIncomingMessage({
      telegramUserId,
      telegramChatId: String(chatId),
      username,
      firstName,
      lastName,
      text: trimmedText,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const replyText = firstName
    ? `Принято, ${firstName}. Сообщение передано менеджеру.`
    : "Принято. Сообщение передано менеджеру.";

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
