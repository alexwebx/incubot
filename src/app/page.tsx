import { Inbox } from "@/components/inbox";
import type { Message } from "@/lib/messages";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at, direction")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Message[];
}

export default async function HomePage() {
  const messages = await getMessages();

  return <Inbox initialMessages={messages} />;
}
