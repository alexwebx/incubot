import { AuthShell } from "@/components/auth-shell";
import { Inbox } from "@/components/inbox";
import type { Message } from "@/lib/messages";
import { getCurrentUser } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

async function getMessages(): Promise<Message[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .select("id, telegram_chat_id, username, first_name, last_name, text, created_at, direction")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Message[];
}

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AuthShell />;
  }

  const messages = await getMessages();

  return (
    <Inbox
      currentUser={{
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_approved: user.is_approved,
        approved_at: user.approved_at,
        created_at: user.created_at,
      }}
      initialMessages={messages}
    />
  );
}
