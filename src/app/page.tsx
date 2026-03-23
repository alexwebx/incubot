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

export default async function HomePage() {
  const messages = await getMessages();

  return (
    <main className="page">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Incubot</p>
            <h1>Telegram Messages</h1>
          </div>
          <p className="counter">{messages.length} records</p>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>telegram_chat_id</th>
                <th>username</th>
                <th>first_name</th>
                <th>last_name</th>
                <th>text</th>
                <th>created_at</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No messages yet
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr key={message.id}>
                    <td>{message.telegram_chat_id}</td>
                    <td>{message.username || "-"}</td>
                    <td>{message.first_name || "-"}</td>
                    <td>{message.last_name || "-"}</td>
                    <td>{message.text || "-"}</td>
                    <td>{new Date(message.created_at).toLocaleString("ru-RU")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
