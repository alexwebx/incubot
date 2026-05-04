"use client";

import { useEffect, useMemo, useState } from "react";
import type { KnowledgeDocument } from "@/lib/knowledge";

type KnowledgeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type KnowledgeResponse = {
  documents?: KnowledgeDocument[];
  document?: KnowledgeDocument | null;
  success?: boolean;
  error?: string;
};

type DraftState = {
  id: string | null;
  title: string;
  content: string;
  isPublished: boolean;
};

const emptyDraft: DraftState = {
  id: null,
  title: "",
  content: "",
  isPublished: true,
};

function formatDate(value: string | null) {
  if (!value) {
    return "нет";
  }

  return new Date(value).toLocaleString("ru-RU");
}

export function KnowledgeModal({ isOpen, onClose }: KnowledgeModalProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === draft.id) ?? null,
    [documents, draft.id],
  );

  async function loadDocuments() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/knowledge", {
        cache: "no-store",
      });
      const payload = (await response.json()) as KnowledgeResponse;

      if (!response.ok || !payload.documents) {
        throw new Error(payload.error ?? "Failed to load knowledge base");
      }

      setDocuments(payload.documents);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load knowledge base");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      void loadDocuments();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function selectDocument(document: KnowledgeDocument) {
    setDraft({
      id: document.id,
      title: document.title,
      content: document.content,
      isPublished: document.is_published,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function resetDraft() {
    setDraft(emptyDraft);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function upsertDocument(document: KnowledgeDocument) {
    setDocuments((currentDocuments) => {
      const exists = currentDocuments.some((item) => item.id === document.id);
      const nextDocuments = exists
        ? currentDocuments.map((item) => (item.id === document.id ? document : item))
        : [document, ...currentDocuments];

      return [...nextDocuments].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      );
    });
    setDraft({
      id: document.id,
      title: document.title,
      content: document.content,
      isPublished: document.is_published,
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(draft.id ? `/api/knowledge/${draft.id}` : "/api/knowledge", {
        method: draft.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: draft.title,
          content: draft.content,
          isPublished: draft.isPublished,
        }),
      });
      const payload = (await response.json()) as KnowledgeResponse;

      if (!response.ok || !payload.document) {
        throw new Error(payload.error ?? "Failed to save knowledge document");
      }

      upsertDocument(payload.document);
      setSuccessMessage("Статья сохранена и проиндексирована.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save knowledge document");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReindex(documentId: string) {
    setActiveActionId(documentId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/knowledge/${documentId}/reindex`, {
        method: "POST",
      });
      const payload = (await response.json()) as KnowledgeResponse;

      if (!response.ok || !payload.document) {
        throw new Error(payload.error ?? "Failed to reindex knowledge document");
      }

      upsertDocument(payload.document);
      setSuccessMessage("Статья переиндексирована.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reindex knowledge document");
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleDelete(documentId: string) {
    setActiveActionId(documentId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/knowledge/${documentId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as KnowledgeResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to delete knowledge document");
      }

      setDocuments((currentDocuments) =>
        currentDocuments.filter((document) => document.id !== documentId),
      );

      if (draft.id === documentId) {
        resetDraft();
      }

      setSuccessMessage("Статья удалена.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete knowledge document");
    } finally {
      setActiveActionId(null);
    }
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <section className="modalCard knowledgeModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Knowledge Base</p>
            <h2>База знаний</h2>
          </div>
          <button type="button" className="ghostButton" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}
        {successMessage ? <p className="successBanner">{successMessage}</p> : null}
        {isLoading ? <p className="hintText">Загружаем базу знаний...</p> : null}

        <div className="knowledgeGrid">
          <section className="knowledgeList">
            <button type="button" className="sendButton" onClick={resetDraft}>
              Новая статья
            </button>

            {documents.length === 0 && !isLoading ? (
              <p className="hintText">Статей пока нет.</p>
            ) : null}

            {documents.map((document) => (
              <article
                key={document.id}
                className={`knowledgeItem${document.id === selectedDocument?.id ? " active" : ""}`}
              >
                <button type="button" onClick={() => selectDocument(document)}>
                  <strong>{document.title}</strong>
                  <span>
                    {document.is_published ? "Опубликована" : "Черновик"} ·{" "}
                    {document.index_status} · {document.chunk_count} chunks
                  </span>
                  <span>Индекс: {formatDate(document.last_indexed_at)}</span>
                </button>

                <div className="knowledgeActions">
                  <button
                    type="button"
                    className="refreshButton"
                    onClick={() => void handleReindex(document.id)}
                    disabled={activeActionId === document.id}
                  >
                    Reindex
                  </button>
                  <button
                    type="button"
                    className="ghostButton dangerButton"
                    onClick={() => void handleDelete(document.id)}
                    disabled={activeActionId === document.id}
                  >
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section className="knowledgeEditor">
            <label className="composerLabel" htmlFor="knowledge-title">
              Заголовок
            </label>
            <input
              id="knowledge-title"
              className="authInput"
              value={draft.title}
              onChange={(event) =>
                setDraft((currentDraft) => ({ ...currentDraft, title: event.target.value }))
              }
              placeholder="Например: Стоимость и условия"
            />

            <label className="checkboxLine">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    isPublished: event.target.checked,
                  }))
                }
              />
              <span>Опубликована</span>
            </label>

            <label className="composerLabel" htmlFor="knowledge-content">
              Текст статьи
            </label>
            <textarea
              id="knowledge-content"
              className="composerInput knowledgeTextarea"
              value={draft.content}
              onChange={(event) =>
                setDraft((currentDraft) => ({ ...currentDraft, content: event.target.value }))
              }
              placeholder="Полный текст, на основе которого бот будет отвечать клиентам."
            />

            <div className="composerActions">
              <span className="hintText">
                Сохранение автоматически пересобирает embedding, если текст изменился.
              </span>
              <button
                type="button"
                className="sendButton"
                onClick={() => void handleSave()}
                disabled={isSaving || !draft.title.trim() || !draft.content.trim()}
              >
                {isSaving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
