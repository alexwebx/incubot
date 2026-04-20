import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const knowledgeRoot = path.join(repoRoot, "knowledge");

function loadEnvFile(filename) {
  const absolutePath = path.join(repoRoot, filename);

  return readFile(absolutePath, "utf8")
    .then((content) => {
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (!line || line.startsWith("#")) {
          continue;
        }

        const separatorIndex = line.indexOf("=");

        if (separatorIndex === -1) {
          continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    })
    .catch(() => undefined);
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function listKnowledgeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listKnowledgeFiles(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!/\.(md|mdx|txt)$/i.test(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function normalizeWhitespace(value) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function createSlug(relativePath) {
  return relativePath
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function extractTitle(content, fallbackName) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  return fallbackName.replace(/\.[^.]+$/, "");
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function chunkContent(content, maxChars = 1200, overlapChars = 200) {
  const normalized = normalizeWhitespace(content);

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split("\n\n");
  const chunks = [];
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

async function generateEmbeddings(apiKey, model, values) {
  if (values.length === 0) {
    return [];
  }

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://incubot.vercel.app",
      "X-Title": "Incubot Knowledge Sync",
    },
    body: JSON.stringify({
      model,
      input: values,
      encoding_format: "float",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenRouter embeddings failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  const data = payload?.data;

  if (!Array.isArray(data) || data.length !== values.length) {
    throw new Error("OpenRouter embeddings response shape is invalid");
  }

  return data.map((item) => item.embedding);
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");
  const embeddingModel = process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const files = await listKnowledgeFiles(knowledgeRoot);

  if (files.length === 0) {
    throw new Error(`No knowledge files found in ${knowledgeRoot}`);
  }

  const sourceKeys = [];
  const summary = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    const rawContent = await readFile(absolutePath, "utf8");
    const content = normalizeWhitespace(rawContent);

    if (!content) {
      continue;
    }

    const title = extractTitle(content, path.basename(relativePath));
    const slug = createSlug(relativePath);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const chunks = chunkContent(content);

    if (chunks.length === 0) {
      continue;
    }

    sourceKeys.push(relativePath);

    const { data: existingDocument, error: existingDocumentError } = await supabase
      .from("knowledge_documents")
      .select("id, content_hash")
      .eq("source_key", relativePath)
      .maybeSingle();

    if (existingDocumentError) {
      throw new Error(existingDocumentError.message);
    }

    if (existingDocument?.content_hash === contentHash) {
      summary.push(`${relativePath}: skipped`);
      continue;
    }

    const { data: document, error: upsertDocumentError } = await supabase
      .from("knowledge_documents")
      .upsert(
        {
          source_key: relativePath,
          slug,
          title,
          content,
          content_hash: contentHash,
          is_published: true,
          metadata: {
            source_path: relativePath,
            synced_at: new Date().toISOString(),
          },
        },
        { onConflict: "source_key" },
      )
      .select("id")
      .single();

    if (upsertDocumentError) {
      throw new Error(upsertDocumentError.message);
    }

    const embeddings = await generateEmbeddings(openRouterApiKey, embeddingModel, chunks);

    const { error: deleteChunksError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", document.id);

    if (deleteChunksError) {
      throw new Error(deleteChunksError.message);
    }

    const { error: insertChunksError } = await supabase.from("knowledge_chunks").insert(
      chunks.map((chunk, index) => ({
        document_id: document.id,
        chunk_index: index,
        content: chunk,
        token_count: estimateTokens(chunk),
        metadata: {
          source_path: relativePath,
          title,
        },
        embedding: embeddings[index],
      })),
    );

    if (insertChunksError) {
      throw new Error(insertChunksError.message);
    }

    summary.push(`${relativePath}: ${chunks.length} chunks`);
  }

  const { data: existingDocuments, error: existingDocumentsError } = await supabase
    .from("knowledge_documents")
    .select("id, source_key");

  if (existingDocumentsError) {
    throw new Error(existingDocumentsError.message);
  }

  const staleDocumentIds = (existingDocuments ?? [])
    .filter((document) => !sourceKeys.includes(document.source_key))
    .map((document) => document.id);

  if (staleDocumentIds.length > 0) {
    const { error: deleteDocumentsError } = await supabase
      .from("knowledge_documents")
      .delete()
      .in("id", staleDocumentIds);

    if (deleteDocumentsError) {
      throw new Error(deleteDocumentsError.message);
    }

    summary.push(`deleted stale documents: ${staleDocumentIds.length}`);
  }

  console.log("Knowledge sync completed");
  for (const line of summary) {
    console.log(`- ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
