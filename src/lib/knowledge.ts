export type KnowledgeDocumentStatus = "pending" | "indexed" | "failed";
export type KnowledgeSourceType = "admin" | "file";

export type KnowledgeDocument = {
  id: string;
  source_key: string;
  slug: string;
  title: string;
  content: string;
  content_hash: string;
  is_published: boolean;
  source_type: KnowledgeSourceType;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  last_indexed_at: string | null;
  index_status: KnowledgeDocumentStatus;
  index_error: string | null;
  created_at: string;
  updated_at: string;
  chunk_count: number;
};
