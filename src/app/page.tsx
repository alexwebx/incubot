import { supabase } from "@/lib/supabase";

type Message = {
  id: string;
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  text: string | null;
  created_at: string;
};

type MessageGroup = {
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  messages: Message[];
};

export const dynamic = "force-dynamic";

async function getMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups = new Map<string, MessageGroup>();

  for (const message of messages) {
    const group = groups.get(message.telegram_chat_id);

    if (group) {
      group.messages.push(message);
      continue;
    }

    groups.set(message.telegram_chat_id, {
      telegram_chat_id: message.telegram_chat_id,
      username: message.username,
      first_name: message.first_name,
      last_name: message.last_name,
      messages: [message],
    });
  }

  return Array.from(groups.values());
}

function getDisplayName(group: MessageGroup): string {
  const fullName = [group.first_name, group.last_name].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (group.username) {
    return `@${group.username}`;
  }

  return "Unknown user";
}

export default async function HomePage() {
  const messages = await getMessages();
  const groups = groupMessages(messages);
  const totalMessages = messages.length;
  const totalUsers = groups.length;

  return (
    <main className="page">
      <section className="panel">
        <div className="panelHeader">
          <div className="brandBlock">
            <div className="brandMark" aria-hidden="true">
              <svg viewBox="0 0 240 240" role="img">
                <circle cx="120" cy="120" r="120" fill="url(#telegramGradient)" />
                <path
                  d="M54 116.7 170.7 71c10.8-4.2 20.1 2.6 16.6 18.8l-19.9 93.7c-2.7 13.1-10.7 16.3-21.8 10.1l-30.3-22.3-14.6 14.1c-1.6 1.6-2.9 2.9-6.1 2.9l2.2-31.5 57.5-52c2.5-2.2-.5-3.4-3.8-1.2l-71 44.7-30.6-9.5c-13.3-4.2-13.6-13.3 2.8-19.7Z"
                  fill="#fff"
                />
                <defs>
                  <linearGradient id="telegramGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#37aee2" />
                    <stop offset="100%" stopColor="#1e96d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <p className="eyebrow">Incubot Admin</p>
              <h1>Telegram Inbox</h1>
              <p className="subtitle">Grouped by chat_id, built for a cleaner moderation flow.</p>
            </div>
          </div>

          <div className="statsGrid">
            <article className="statCard">
              <span className="statLabel">Total Messages</span>
              <strong className="statValue">{totalMessages}</strong>
            </article>
            <article className="statCard">
              <span className="statLabel">Unique Users</span>
              <strong className="statValue">{totalUsers}</strong>
            </article>
          </div>
        </div>

        <div className="groups">
          {groups.length === 0 ? (
            <section className="emptyState">
              <p className="emptyTitle">No messages yet</p>
              <p className="emptyText">Telegram webhook is connected, but no user messages have been stored.</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.telegram_chat_id} className="groupCard">
                <header className="groupHeader">
                  <div className="groupTitleRow">
                    <h2>{getDisplayName(group)}</h2>
                    <span className="messageBadge">{group.messages.length} msgs</span>
                  </div>
                  <p className="groupMeta">
                    <span>chat_id: {group.telegram_chat_id}</span>
                    <span>{group.username ? `@${group.username}` : "no username"}</span>
                  </p>
                </header>

                <div className="messageList">
                  {group.messages.map((message) => (
                    <article key={message.id} className="messageCard">
                      <p className="messageText">{message.text || "-"}</p>
                      <time className="messageTime">
                        {new Date(message.created_at).toLocaleString("ru-RU")}
                      </time>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
