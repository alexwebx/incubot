import { createHash } from "node:crypto";
import type { AppUser } from "@/lib/auth";
import type { KnowledgeDocument } from "@/lib/knowledge";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type KnowledgeDocumentRow = Omit<KnowledgeDocument, "chunk_count">;

type KnowledgeChunkRow = {
  id: string;
  document_id: string;
};

type LegacyKnowledgeDocumentRow = {
  id: string;
  source_key: string;
  slug: string;
  title: string;
  content: string;
  content_hash: string;
  is_published: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function isMissingColumnError(error: { code?: string; message: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.includes("does not exist") ||
    error.message.includes("Could not find") ||
    error.message.includes("schema cache")
  );
}

function toKnowledgeDocumentRow(document: LegacyKnowledgeDocumentRow): KnowledgeDocumentRow {
  return {
    ...document,
    source_type: "admin",
    created_by: null,
    updated_by: null,
    last_indexed_at: null,
    index_status: "indexed",
    index_error: null,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function createSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё/_-]+/giu, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function createSourceKey(title: string) {
  const slug = createSlug(title);
  return `admin/${slug || "article"}-${crypto.randomUUID()}`;
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function chunkContent(content: string, maxChars = 1200, overlapChars = 200) {
  const normalized = normalizeWhitespace(content);

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split("\n\n");
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      const end = Math.min(start + maxChars, paragraph.length);
      const slice = paragraph.slice(start, end).trim();

      if (slice) {
        chunks.push(slice);
      }

      start = Math.max(end - overlapChars, start + 1);
    }

    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

async function generateEmbeddings(values: string[]) {
  if (values.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Knowledge Admin",
    },
    body: JSON.stringify({
      model,
      input: values,
      encoding_format: "float",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`OpenRouter embeddings failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const data = payload?.data;

  if (!Array.isArray(data) || data.length !== values.length) {
    throw new Error("OpenRouter embeddings response shape is invalid");
  }

  return data.map((item) => item.embedding as number[]);
}

async function hydrateChunkCounts(documents: KnowledgeDocumentRow[]) {
  if (documents.length === 0) {
    return [];
  }

  const documentIds = documents.map((document) => document.id);
  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_chunks")
    .select("id, document_id")
    .in("document_id", documentIds);

  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();

  for (const chunk of (data ?? []) as KnowledgeChunkRow[]) {
    counts.set(chunk.document_id, (counts.get(chunk.document_id) ?? 0) + 1);
  }

  return documents.map((document) => ({
    ...document,
    chunk_count: counts.get(document.id) ?? 0,
  }));
}

export async function listKnowledgeDocuments() {
  const queryWithIndexColumns = await getSupabaseAdmin()
    .from("knowledge_documents")
    .select(
      [
        "id",
        "source_key",
        "slug",
        "title",
        "content",
        "content_hash",
        "is_published",
        "source_type",
        "metadata",
        "created_by",
        "updated_by",
        "last_indexed_at",
        "index_status",
        "index_error",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("updated_at", { ascending: false });

  if (!queryWithIndexColumns.error) {
    return hydrateChunkCounts((queryWithIndexColumns.data ?? []) as unknown as KnowledgeDocumentRow[]);
  }

  if (!isMissingColumnError(queryWithIndexColumns.error)) {
    throw new Error(queryWithIndexColumns.error.message);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_documents")
    .select(
      [
        "id",
        "source_key",
        "slug",
        "title",
        "content",
        "content_hash",
        "is_published",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return hydrateChunkCounts(
    ((data ?? []) as unknown as LegacyKnowledgeDocumentRow[]).map(toKnowledgeDocumentRow),
  );
}

export async function findKnowledgeDocument(documentId: string) {
  const queryWithIndexColumns = await getSupabaseAdmin()
    .from("knowledge_documents")
    .select(
      [
        "id",
        "source_key",
        "slug",
        "title",
        "content",
        "content_hash",
        "is_published",
        "source_type",
        "metadata",
        "created_by",
        "updated_by",
        "last_indexed_at",
        "index_status",
        "index_error",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("id", documentId)
    .maybeSingle<KnowledgeDocumentRow>();

  if (!queryWithIndexColumns.error) {
    if (!queryWithIndexColumns.data) {
      return null;
    }

    const [document] = await hydrateChunkCounts([queryWithIndexColumns.data]);
    return document;
  }

  if (!isMissingColumnError(queryWithIndexColumns.error)) {
    throw new Error(queryWithIndexColumns.error.message);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_documents")
    .select(
      [
        "id",
        "source_key",
        "slug",
        "title",
        "content",
        "content_hash",
        "is_published",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("id", documentId)
    .maybeSingle<LegacyKnowledgeDocumentRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const [document] = await hydrateChunkCounts([toKnowledgeDocumentRow(data)]);
  return document;
}

export async function createKnowledgeDocument(input: {
  title: string;
  content: string;
  isPublished: boolean;
  currentUser: AppUser;
}) {
  const title = input.title.trim();
  const content = normalizeWhitespace(input.content);

  if (!title) {
    throw new Error("title is required");
  }

  if (!content) {
    throw new Error("content is required");
  }

  const sourceKey = createSourceKey(title);
  let insertResult = await getSupabaseAdmin()
    .from("knowledge_documents")
    .insert({
      source_key: sourceKey,
      slug: sourceKey.replace(/^admin\//, ""),
      title,
      content,
      content_hash: contentHash(content),
      is_published: input.isPublished,
      source_type: "admin",
      created_by: input.currentUser.id,
      updated_by: input.currentUser.id,
      index_status: "pending",
      metadata: {
        source: "admin",
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertResult.error && isMissingColumnError(insertResult.error)) {
    insertResult = await getSupabaseAdmin()
      .from("knowledge_documents")
      .insert({
        source_key: sourceKey,
        slug: sourceKey.replace(/^admin\//, ""),
        title,
        content,
        content_hash: contentHash(content),
        is_published: input.isPublished,
        metadata: {
          source: "admin",
        },
      })
      .select("id")
      .single<{ id: string }>();
  }

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  return reindexKnowledgeDocument(insertResult.data.id, input.currentUser);
}

export async function updateKnowledgeDocument(
  documentId: string,
  input: {
    title: string;
    content: string;
    isPublished: boolean;
    currentUser: AppUser;
  },
) {
  const title = input.title.trim();
  const content = normalizeWhitespace(input.content);

  if (!title) {
    throw new Error("title is required");
  }

  if (!content) {
    throw new Error("content is required");
  }

  const existingDocument = await findKnowledgeDocument(documentId);

  if (!existingDocument) {
    throw new Error("Knowledge document not found");
  }

  const nextHash = contentHash(content);
  const shouldReindex = existingDocument.content_hash !== nextHash;
  let updateResult = await getSupabaseAdmin()
    .from("knowledge_documents")
    .update({
      title,
      slug: createSlug(title) || existingDocument.slug,
      content,
      content_hash: nextHash,
      is_published: input.isPublished,
      updated_by: input.currentUser.id,
      index_status: shouldReindex ? "pending" : existingDocument.index_status,
      index_error: shouldReindex ? null : existingDocument.index_error,
    })
    .eq("id", documentId);

  if (updateResult.error && isMissingColumnError(updateResult.error)) {
    updateResult = await getSupabaseAdmin()
      .from("knowledge_documents")
      .update({
        title,
        slug: createSlug(title) || existingDocument.slug,
        content,
        content_hash: nextHash,
        is_published: input.isPublished,
      })
      .eq("id", documentId);
  }

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  if (shouldReindex) {
    return reindexKnowledgeDocument(documentId, input.currentUser);
  }

  return findKnowledgeDocument(documentId);
}

export async function deleteKnowledgeDocument(documentId: string) {
  const { error } = await getSupabaseAdmin()
    .from("knowledge_documents")
    .delete()
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function reindexKnowledgeDocument(documentId: string, currentUser: AppUser) {
  const document = await findKnowledgeDocument(documentId);

  if (!document) {
    throw new Error("Knowledge document not found");
  }

  const chunks = chunkContent(document.content);

  if (chunks.length === 0) {
    throw new Error("Knowledge document has no indexable content");
  }

  try {
    const embeddings = await generateEmbeddings(chunks);

    const { error: deleteChunksError } = await getSupabaseAdmin()
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

    if (deleteChunksError) {
      throw new Error(deleteChunksError.message);
    }

    const { error: insertChunksError } = await getSupabaseAdmin().from("knowledge_chunks").insert(
      chunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: index,
        content: chunk,
        token_count: estimateTokens(chunk),
        metadata: {
          source: "admin",
          title: document.title,
        },
        embedding: embeddings[index],
      })),
    );

    if (insertChunksError) {
      throw new Error(insertChunksError.message);
    }

    const { error: updateDocumentError } = await getSupabaseAdmin()
      .from("knowledge_documents")
      .update({
        index_status: "indexed",
        index_error: null,
        last_indexed_at: new Date().toISOString(),
        updated_by: currentUser.id,
      })
      .eq("id", documentId);

    if (updateDocumentError && !isMissingColumnError(updateDocumentError)) {
      throw new Error(updateDocumentError.message);
    }
  } catch (error) {
    const updateFailedResult = await getSupabaseAdmin()
      .from("knowledge_documents")
      .update({
        index_status: "failed",
        index_error: error instanceof Error ? error.message : "Unknown indexing error",
        updated_by: currentUser.id,
      })
      .eq("id", documentId);

    if (updateFailedResult.error && !isMissingColumnError(updateFailedResult.error)) {
      console.error("knowledge index status update error", updateFailedResult.error.message);
    }

    throw error;
  }

  return findKnowledgeDocument(documentId);
}
