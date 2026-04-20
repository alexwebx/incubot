"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/auth";
import { type DialogMessage, type InboxDialog, getClientDisplayName, getDialogPreview } from "@/lib/dialogs";
import { supabase } from "@/lib/supabase";
import { ManagersModal } from "@/components/managers-modal";

type InboxProps = {
  currentUser: PublicUser;
  initialDialogs: InboxDialog[];
  initialAssignableUsers: PublicUser[];
};

type InboxResponse = {
  dialogs?: InboxDialog[];
  assignableUsers?: PublicUser[];
  error?: string;
};

type SendMessageResponse = {
  message?: DialogMessage;
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

async function loadInbox() {
  const response = await fetch("/api/inbox", {
    cache: "no-store",
  });
  const payload = (await response.json()) as InboxResponse;

  if (!response.ok || !payload.dialogs || !payload.assignableUsers) {
    throw new Error(payload.error ?? "Failed to refresh inbox");
  }

  return payload;
}

function getMessageBubbleClass(senderType: DialogMessage["sender_type"]) {
  if (senderType === "manager") {
    return "bubbleOutgoing";
  }

  if (senderType === "assistant") {
    return "bubbleAssistant";
  }

  return "bubbleIncoming";
}

function upsertLocalMessage(dialogs: InboxDialog[], dialogId: string, message: DialogMessage) {
  return dialogs
    .map((dialog) => {
      if (dialog.id !== dialogId) {
        return dialog;
      }

      return {
        ...dialog,
        messages: [...dialog.messages, message].sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        ),
        latest_message_at: message.created_at,
        updated_at: message.created_at,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.latest_message_at).getTime() - new Date(left.latest_message_at).getTime(),
    );
}

export function Inbox({ currentUser, initialDialogs, initialAssignableUsers }: InboxProps) {
  const [dialogs, setDialogs] = useState(initialDialogs);
  const [assignableUsers, setAssignableUsers] = useState(initialAssignableUsers);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(initialDialogs[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isManagersOpen, setIsManagersOpen] = useState(false);

  const selectedDialog = dialogs.find((dialog) => dialog.id === selectedDialogId) ?? dialogs[0] ?? null;
  const assignableManagerId = selectedDialog?.active_assignment?.manager_id ?? "";

  useEffect(() => {
    if (!dialogs.length) {
      setSelectedDialogId(null);
      return;
    }

    const hasSelectedDialog = dialogs.some((dialog) => dialog.id === selectedDialogId);

    if (!hasSelectedDialog) {
      setSelectedDialogId(dialogs[0].id);
    }
  }, [dialogs, selectedDialogId]);

  useEffect(() => {
    const channel = supabase
      .channel(`inbox-live-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "realtime_events" },
        () => {
          startTransition(() => {
            void refreshInbox();
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  const stats = useMemo(
    () => ({
      dialogs: dialogs.length,
      messages: dialogs.reduce((sum, dialog) => sum + dialog.messages.length, 0),
    }),
    [dialogs],
  );

  async function refreshInbox() {
    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const payload = await loadInbox();
      setDialogs(payload.dialogs ?? []);
      setAssignableUsers(payload.assignableUsers ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh inbox";
      setErrorMessage(message);

      if (message === "Unauthorized") {
        window.location.reload();
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedDialog || !draft.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/dialogs/${selectedDialog.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: draft,
        }),
      });
      const payload = (await response.json()) as SendMessageResponse;

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "Failed to send message");
      }

      setDialogs((currentDialogs) => upsertLocalMessage(currentDialogs, selectedDialog.id, payload.message!));
      setDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  async function handleAssign(managerId: string) {
    if (!selectedDialog || !managerId) {
      return;
    }

    setIsAssigning(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/dialogs/${selectedDialog.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          managerId,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to assign dialog");
      }

      await refreshInbox();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to assign dialog");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.reload();
    }
  }

  return (
    <>
      <main className="page">
        <section className="shell">
          <aside className="sidebar">
            <div className="sidebarTop">
              <div>
                <p className="eyebrow">Incubot Admin</p>
                <h1>Telegram Inbox</h1>
                <p className="subtitle">
                  {currentUser.full_name || currentUser.email} ·{" "}
                  {currentUser.role === "admin" ? "Главный админ" : "Менеджер"}
                </p>
              </div>

              <div className="sidebarButtons">
                <span className="liveBadge">{isSyncing ? "Синхронизация..." : "Live updates"}</span>

                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => setIsManagersOpen(true)}
                >
                  {currentUser.role === "admin" ? "Менеджеры" : "Профиль"}
                </button>

                <button
                  type="button"
                  className="ghostButton"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? "Выходим..." : "Выйти"}
                </button>
              </div>
            </div>

            <div className="sidebarStats">
              <article className="statCard">
                <span className="statLabel">Dialogs</span>
                <strong className="statValue">{stats.dialogs}</strong>
              </article>
              <article className="statCard">
                <span className="statLabel">Messages</span>
                <strong className="statValue">{stats.messages}</strong>
              </article>
            </div>

            <div className="chatList">
              {dialogs.length === 0 ? (
                <section className="emptySidebar">
                  <p className="emptyTitle">Пока пусто</p>
                  <p className="emptyText">
                    Диалоги появятся здесь после первого сообщения в Telegram.
                  </p>
                </section>
              ) : (
                dialogs.map((dialog) => {
                  const lastMessage = dialog.messages[dialog.messages.length - 1];
                  const isActive = dialog.id === selectedDialog?.id;

                  return (
                    <button
                      key={dialog.id}
                      type="button"
                      className={`chatListItem${isActive ? " active" : ""}`}
                      onClick={() => setSelectedDialogId(dialog.id)}
                    >
                      <div className="chatAvatar" aria-hidden="true">
                        {getClientDisplayName(dialog.client).slice(0, 1).toUpperCase()}
                      </div>

                      <div className="chatMeta">
                        <div className="chatMetaTop">
                          <strong>{getClientDisplayName(dialog.client)}</strong>
                          <time>{formatMessageTime(dialog.latest_message_at)}</time>
                        </div>

                        <p className="chatPreview">{getDialogPreview(lastMessage)}</p>

                        <p className="chatSecondary">
                          <span>
                            {dialog.client.username ? `@${dialog.client.username}` : "без username"}
                          </span>
                          <span>
                            {dialog.assigned_manager
                              ? `Ответственный: ${dialog.assigned_manager.full_name || dialog.assigned_manager.email}`
                              : "Не назначен"}
                          </span>
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="conversationPanel">
            {selectedDialog ? (
              <>
                <header className="conversationHeader">
                  <div className="conversationHeaderInner">
                    <div>
                      <p className="conversationEyebrow">Диалог</p>
                      <h2>{getClientDisplayName(selectedDialog.client)}</h2>
                      <p className="conversationMeta">
                        <span>chat_id: {selectedDialog.client.telegram_chat_id}</span>
                        <span>
                          {selectedDialog.client.username
                            ? `@${selectedDialog.client.username}`
                            : "без username"}
                        </span>
                        <span>
                          {selectedDialog.assigned_manager
                            ? `Назначен: ${selectedDialog.assigned_manager.full_name || selectedDialog.assigned_manager.email}`
                            : "AI fallback активен до назначения менеджера"}
                        </span>
                      </p>
                    </div>

                    <div className="assignmentBox">
                      <label className="assignmentLabel" htmlFor="dialog-assignment">
                        Ответственный
                      </label>
                      <select
                        id="dialog-assignment"
                        className="assignmentSelect"
                        value={assignableManagerId}
                        onChange={(event) => void handleAssign(event.target.value)}
                        disabled={isAssigning || assignableUsers.length === 0}
                      >
                        <option value="" disabled>
                          Выберите менеджера
                        </option>
                        {assignableUsers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.full_name || manager.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </header>

                <div className="messagesPane">
                  {selectedDialog.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`bubble ${getMessageBubbleClass(message.sender_type)}`}
                    >
                      <p className="messageText">{message.text || "-"}</p>
                      <time className="messageTime">
                        {new Date(message.created_at).toLocaleString("ru-RU")}
                      </time>
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
                    {errorMessage ? (
                      <p className="errorText">{errorMessage}</p>
                    ) : (
                      <span className="hintText">
                        Обновление списка и сообщений приходит автоматически через realtime.
                      </span>
                    )}
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
                <p className="emptyTitle">Нет доступных диалогов</p>
                <p className="emptyText">
                  Диалоги появятся здесь автоматически после новых обращений.
                </p>
              </section>
            )}
          </section>
        </section>
      </main>

      <ManagersModal
        currentUser={currentUser}
        isOpen={isManagersOpen}
        onClose={() => setIsManagersOpen(false)}
      />
    </>
  );
}
