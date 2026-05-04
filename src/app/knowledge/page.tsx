import { AuthShell } from "@/components/auth-shell";
import { KnowledgeModal } from "@/components/knowledge-modal";
import { getCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AuthShell />;
  }

  if (user.role !== "admin") {
    return (
      <main className="page">
        <section className="emptyConversation">
          <p className="emptyTitle">Нет доступа</p>
          <p className="emptyText">База знаний доступна только администратору.</p>
        </section>
      </main>
    );
  }

  return <KnowledgeModal isOpen />;
}
