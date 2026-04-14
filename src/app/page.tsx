import { AuthShell } from "@/components/auth-shell";
import { Inbox } from "@/components/inbox";
import { getCurrentUser } from "@/lib/server/auth";
import { loadInboxData } from "@/lib/server/dialogs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AuthShell />;
  }

  const { dialogs, assignableUsers } = await loadInboxData(user);

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
      initialDialogs={dialogs}
      initialAssignableUsers={assignableUsers}
    />
  );
}
