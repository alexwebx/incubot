"use client";

import { useEffect, useMemo, useState } from "react";
import { groupMessages, getDisplayName, getMessagePreview, type Message } from "@/lib/messages";
import { supabase } from "@/lib/supabase";

type InboxProps = {
  initialMessages: Message[];
};

type SendMessageResponse = {
  message?: Message;
  error?: string;
};

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at, direction")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Message[];
}

export function Inbox({ initialMessages }: InboxProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialMessages[0]?.telegram_chat_id ?? null,
  );
  const [draft, setDraft] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const groups = useMemo(() => groupMessages(messages), [messages]);
  const selectedGroup = groups.find((group) => group.telegram_chat_id === selectedChatId) ?? groups[0] ?? null;

  useEffect(() => {
    if (!groups.length) {
      setSelectedChatId(null);
      return;
    }

    const hasSelectedGroup = groups.some((group) => group.telegram_chat_id === selectedChatId);

    if (!hasSelectedGroup) {
      setSelectedChatId(groups[0].telegram_chat_id);
    }
  }, [groups, selectedChatId]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const nextMessages = await loadMessages();
      setMessages(nextMessages);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh messages");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedGroup || !draft.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegram_chat_id: selectedGroup.telegram_chat_id,
          text: draft,
          username: selectedGroup.username,
          first_name: selectedGroup.first_name,
          last_name: selectedGroup.last_name,
        }),
      });

      const payload = (await response.json()) as SendMessageResponse;

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "Failed to send message");
      }

      setMessages((currentMessages) => [payload.message as Message, ...currentMessages]);
      setDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="page">
      <section className="shell">
        <aside className="sidebar">
          <div className="sidebarTop">
            <div>
              <p className="eyebrow">Incubot Admin</p>
              <h1>Telegram Inbox</h1>
              <p className="subtitle">Список пользователей слева, переписка справа.</p>
            </div>

            <button
              type="button"
              className="refreshButton"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Обновляем..." : "Обновить"}
            </button>
          </div>

          <div className="sidebarStats">
            <article className="statCard">
              <span className="statLabel">Users</span>
              <strong className="statValue">{groups.length}</strong>
            </article>
            <article className="statCard">
              <span className="statLabel">Messages</span>
              <strong className="statValue">{messages.length}</strong>
            </article>
          </div>

          <div className="chatList">
            {groups.length === 0 ? (
              <section className="emptySidebar">
                <p className="emptyTitle">Пока пусто</p>
                <p className="emptyText">Сообщения появятся здесь после первого диалога в Telegram.</p>
              </section>
            ) : (
              groups.map((group) => {
                const lastMessage = group.messages[group.messages.length - 1];
                const isActive = group.telegram_chat_id === selectedGroup?.telegram_chat_id;

                return (
                  <button
                    key={group.telegram_chat_id}
                    type="button"
                    className={`chatListItem${isActive ? " active" : ""}`}
                    onClick={() => setSelectedChatId(group.telegram_chat_id)}
                  >
                    <div className="chatAvatar" aria-hidden="true">
                      {getDisplayName(group).slice(0, 1).toUpperCase()}
                    </div>

                    <div className="chatMeta">
                      <div className="chatMetaTop">
                        <strong>{getDisplayName(group)}</strong>
                        <time>{formatMessageTime(group.latest_message_at)}</time>
                      </div>

                      <p className="chatPreview">{getMessagePreview(lastMessage)}</p>

                      <p className="chatSecondary">
                        <span>{group.username ? `@${group.username}` : "без username"}</span>
                        <span>{group.messages.length} сообщений</span>
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="conversationPanel">
          {selectedGroup ? (
            <>
              <header className="conversationHeader">
                <div>
                  <p className="conversationEyebrow">Диалог</p>
                  <h2>{getDisplayName(selectedGroup)}</h2>
                  <p className="conversationMeta">
                    <span>chat_id: {selectedGroup.telegram_chat_id}</span>
                    <span>{selectedGroup.username ? `@${selectedGroup.username}` : "без username"}</span>
                  </p>
                </div>
              </header>

              <div className="messagesPane">
                {selectedGroup.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`bubble ${message.direction === "outgoing" ? "bubbleOutgoing" : "bubbleIncoming"}`}
                  >
                    <p className="messageText">{message.text || "-"}</p>
                    <time className="messageTime">{new Date(message.created_at).toLocaleString("ru-RU")}</time>
                  </article>
                ))}
              </div>

              <div className="composer">
                <label className="composerLabel" htmlFor="reply">
                  Ответ пользователю
                </label>
                <textarea
                  id="reply"
                  className="composerInput"
                  placeholder="Введите ответ, который уйдёт в Telegram..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                />

                <div className="composerActions">
                  {errorMessage ? <p className="errorText">{errorMessage}</p> : <span className="hintText">Ответ появится в боте сразу после отправки.</span>}
                  <button
                    type="button"
                    className="sendButton"
                    onClick={handleSendMessage}
                    disabled={isSending || !draft.trim()}
                  >
                    {isSending ? "Отправляем..." : "Отправить"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <section className="emptyConversation">
              <p className="emptyTitle">Нет выбранного диалога</p>
              <p className="emptyText">Когда появятся пользователи, можно будет открыть переписку справа.</p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
