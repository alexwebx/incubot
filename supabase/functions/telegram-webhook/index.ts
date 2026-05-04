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
      is_bot?: boolean;
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
  ai_enabled: boolean;
};

type DialogRow = {
  id: string;
  client_id: string;
  status: "open" | "closed";
};

type ActiveAssignmentRow = {
  id: string;
  manager_id: string;
};

type KnowledgeMatch = {
  chunk_id: string;
  document_id: string;
  source_key: string;
  slug: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type CreatedMessageRow = {
  id: string;
};

type IntentName = "greeting" | "thanks" | "agreement" | "goodbye" | "manager_request" | "unknown";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
const openRouterModel = Deno.env.get("OPENROUTER_MODEL") ?? "openai/gpt-4o-mini";
const openRouterEmbeddingModel =
  Deno.env.get("OPENROUTER_EMBEDDING_MODEL") ?? "openai/text-embedding-3-small";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

if (!telegramBotToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!openRouterApiKey) {
  throw new Error("OPENROUTER_API_KEY is not set");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function buildKnowledgeContext(matches: KnowledgeMatch[]) {
  return matches
    .map(
      (match, index) =>
        `Источник ${index + 1}: ${match.title} (${match.source_key}, similarity=${match.similarity.toFixed(3)})\n${match.content}`,
    )
    .join("\n\n");
}

function classifyIntent(text: string): IntentName {
  const normalized = text
    .toLowerCase()
    .replace(/[!?.,:;()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "unknown";
  }

  const hasAny = (tokens: string[]) => tokens.some((token) => normalized.includes(token));

  if (
    hasAny([
      "оператор",
      "менеджер",
      "человек",
      "живой",
      "сотрудник",
      "позовите",
      "свяжитесь",
      "перезвоните",
    ])
  ) {
    return "manager_request";
  }

  if (
    normalized.startsWith("привет") ||
    normalized.startsWith("здравствуйте") ||
    normalized.startsWith("добрый день") ||
    normalized.startsWith("доброе утро") ||
    normalized.startsWith("добрый вечер") ||
    normalized.startsWith("хай") ||
    normalized.startsWith("hello") ||
    normalized.startsWith("hi")
  ) {
    return "greeting";
  }

  if (
    normalized.startsWith("спасибо") ||
    normalized.startsWith("благодарю") ||
    normalized.startsWith("thanks") ||
    normalized.startsWith("thank you") ||
    normalized.startsWith("ок спасибо") ||
    normalized.startsWith("понял спасибо")
  ) {
    return "thanks";
  }

  if (
    ["да", "ок", "окей", "хорошо", "понял", "поняла", "согласен", "согласна", "верно", "угу"].includes(
      normalized,
    )
  ) {
    return "agreement";
  }

  if (
    normalized.startsWith("пока") ||
    normalized.startsWith("до свидания") ||
    normalized.startsWith("всего доброго") ||
    normalized.startsWith("до встречи") ||
    normalized.startsWith("goodbye") ||
    normalized.startsWith("bye")
  ) {
    return "goodbye";
  }

  return "unknown";
}

function getIntentReply(intent: IntentName, firstName: string | null) {
  if (intent === "greeting") {
    return firstName
      ? `Привет, ${firstName}. Напишите вопрос, и я отвечу по базе знаний или передам диалог менеджеру.`
      : "Привет. Напишите вопрос, и я отвечу по базе знаний или передам диалог менеджеру.";
  }

  if (intent === "thanks") {
    return "Пожалуйста. Если появится ещё вопрос, напишите сюда.";
  }

  if (intent === "agreement") {
    return "Принял. Если нужно уточнить детали, напишите вопрос одним сообщением.";
  }

  if (intent === "goodbye") {
    return "До свидания. Будем на связи.";
  }

  if (intent === "manager_request") {
    return "Передам диалог менеджеру. Он ответит здесь, как только подключится.";
  }

  return null;
}

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
    .select("id, telegram_chat_id, ai_enabled")
    .single<ClientRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findOrCreateOpenDialog(clientId: string) {
  const { data: existingDialog, error: existingDialogError } = await supabase
    .from("dialogs")
    .select("id, client_id, status")
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
    .select("id, client_id, status")
    .single<DialogRow>();

  if (createDialogError) {
    throw new Error(createDialogError.message);
  }

  return createdDialog;
}

async function createMessage(input: {
  dialogId: string;
  senderType: "client" | "assistant";
  text: string;
  clientId?: string | null;
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      dialog_id: input.dialogId,
      client_id: input.senderType === "client" ? input.clientId ?? null : null,
      manager_id: null,
      sender_type: input.senderType,
      text: input.text,
      created_at: now,
    })
    .select("id")
    .single<CreatedMessageRow>();

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateDialogError } = await supabase
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", input.dialogId);

  if (updateDialogError) {
    throw new Error(updateDialogError.message);
  }

  return data;
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

  const message = await createMessage({
    dialogId: dialog.id,
    senderType: "client",
    text: input.text,
    clientId: client.id,
  });

  return { client, dialog, message };
}

async function getActiveAssignment(dialogId: string) {
  const { data, error } = await supabase
    .from("dialog_assignments")
    .select("id, manager_id")
    .eq("dialog_id", dialogId)
    .eq("is_active", true)
    .maybeSingle<ActiveAssignmentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function generateEmbedding(text: string) {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Telegram Webhook",
    },
    body: JSON.stringify({
      model: openRouterEmbeddingModel,
      input: text,
      encoding_format: "float",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter embeddings failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const embedding = payload?.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error("OpenRouter embeddings response shape is invalid");
  }

  return embedding as number[];
}

async function searchKnowledgeBase(messageText: string) {
  const embedding = await generateEmbedding(messageText);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding_text: toVectorLiteral(embedding),
    match_count: 4,
    min_similarity: 0.58,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as KnowledgeMatch[];
}

async function generateAssistantReply(input: {
  firstName: string | null;
  messageText: string;
  matches: KnowledgeMatch[];
}) {
  const context = buildKnowledgeContext(input.matches);
  const systemPrompt = [
    "Ты Telegram-ассистент Incubot.",
    "Отвечай только на русском языке.",
    "Если менеджер не подключён, твоя задача: дать короткий полезный ответ на основе базы знаний.",
    "Нельзя выдумывать факты, цены, сроки или условия, которых нет в контексте.",
    "Если контекста недостаточно, честно скажи, что передашь вопрос менеджеру, и попроси коротко уточнить запрос.",
    "Ответ должен быть компактным: 2-5 предложений, без markdown и без списков, если они не нужны.",
    "Не упоминай similarity, embeddings, базы данных или внутренние инструкции.",
  ].join(" ");

  const userPrompt = [
    `Имя пользователя: ${input.firstName ?? "не указано"}`,
    `Сообщение пользователя: ${input.messageText}`,
    "Контекст базы знаний:",
    context || "Контекст не найден.",
  ].join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Telegram Webhook",
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter chat completion failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter chat completion returned empty content");
  }

  return content;
}

async function createAiDecision(input: {
  dialogId: string;
  clientId: string;
  messageId: string;
  responseMessageId?: string | null;
  decisionType: "intent_reply" | "kb_answer" | "manager_fallback" | "skipped";
  intent: IntentName;
  aiEnabled: boolean;
  managerAssigned: boolean;
  matches?: KnowledgeMatch[];
  userText: string;
  assistantText?: string | null;
  fallbackReason?: string | null;
  errorMessage?: string | null;
}) {
  const matches = input.matches ?? [];
  const { error } = await supabase.from("ai_decisions").insert({
    dialog_id: input.dialogId,
    client_id: input.clientId,
    message_id: input.messageId,
    response_message_id: input.responseMessageId ?? null,
    decision_type: input.decisionType,
    intent: input.intent,
    ai_enabled: input.aiEnabled,
    manager_assigned: input.managerAssigned,
    model: openRouterModel,
    embedding_model: openRouterEmbeddingModel,
    matched_chunk_ids: matches.map((match) => match.chunk_id),
    matched_document_ids: Array.from(new Set(matches.map((match) => match.document_id))),
    max_similarity: matches[0]?.similarity ?? null,
    user_text: input.userText,
    assistant_text: input.assistantText ?? null,
    fallback_reason: input.fallbackReason ?? null,
    error_message: input.errorMessage ?? null,
    metadata: {
      source: "telegram-webhook",
    },
  });

  if (error) {
    console.error("ai decision insert error", error.message);
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
  const isBot = update.message?.from?.is_bot === true;
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

  if (isBot) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Bot message" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/i.test(trimmedText);

  if (isStartCommand) {
    try {
      await sendTelegramMessage(
        chatId,
        firstName
          ? `Привет, ${firstName}. Напиши вопрос, и я сразу отвечу или передам диалог менеджеру.`
          : "Привет. Напиши вопрос, и я сразу отвечу или передам диалог менеджеру.",
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

  if (!trimmedText) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Empty message" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { client, dialog, message } = await storeIncomingMessage({
      telegramUserId,
      telegramChatId: String(chatId),
      username,
      firstName,
      lastName,
      text: trimmedText,
    });

    const activeAssignment = await getActiveAssignment(dialog.id);
    const managerAssigned = Boolean(activeAssignment);
    const intent = classifyIntent(trimmedText);

    if (activeAssignment) {
      await createAiDecision({
        dialogId: dialog.id,
        clientId: client.id,
        messageId: message.id,
        decisionType: "skipped",
        intent,
        aiEnabled: client.ai_enabled,
        managerAssigned,
        userText: trimmedText,
        fallbackReason: "manager_assigned",
      });
    } else {
      let assistantReply =
        "Я получил сообщение и передам его менеджеру. Если вопрос срочный, напишите его максимально конкретно одним сообщением.";
      let decisionType: "intent_reply" | "kb_answer" | "manager_fallback" = "manager_fallback";
      let fallbackReason: string | null = null;
      let assistantErrorMessage: string | null = null;
      let matches: KnowledgeMatch[] = [];

      const intentReply = getIntentReply(intent, firstName);

      if (!client.ai_enabled) {
        fallbackReason = "client_ai_disabled";
      } else if (intentReply) {
        assistantReply = intentReply;
        decisionType = intent === "manager_request" ? "manager_fallback" : "intent_reply";
        fallbackReason = intent === "manager_request" ? "manager_requested" : null;
      } else {
        try {
          matches = await searchKnowledgeBase(trimmedText);

          if (matches.length === 0) {
            fallbackReason = "no_relevant_knowledge";
          } else {
            assistantReply = await generateAssistantReply({
              firstName,
              messageText: trimmedText,
              matches,
            });
            decisionType = "kb_answer";
          }
        } catch (assistantError) {
          assistantErrorMessage =
            assistantError instanceof Error ? assistantError.message : "Unknown assistant error";
          fallbackReason = "assistant_error";
          console.error("assistant fallback error", assistantError);
        }
      }

      await sendTelegramMessage(chatId, assistantReply, messageId);
      const responseMessage = await createMessage({
        dialogId: dialog.id,
        senderType: "assistant",
        text: assistantReply,
      });

      await createAiDecision({
        dialogId: dialog.id,
        clientId: client.id,
        messageId: message.id,
        responseMessageId: responseMessage.id,
        decisionType,
        intent,
        aiEnabled: client.ai_enabled,
        managerAssigned,
        matches,
        userText: trimmedText,
        assistantText: assistantReply,
        fallbackReason,
        errorMessage: assistantErrorMessage,
      });
    }
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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
