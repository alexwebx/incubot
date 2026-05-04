import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/server/auth";
import {
  deleteKnowledgeDocument,
  findKnowledgeDocument,
  updateKnowledgeDocument,
} from "@/lib/server/knowledge";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireRole("admin");
    const { documentId } = await context.params;
    const document = await findKnowledgeDocument(documentId);

    if (!document) {
      return NextResponse.json({ error: "Knowledge document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load knowledge document" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireRole("admin");
    const { documentId } = await context.params;
    const payload = (await request.json()) as {
      title?: string;
      content?: string;
      isPublished?: boolean;
    };

    const document = await updateKnowledgeDocument(documentId, {
      title: payload.title ?? "",
      content: payload.content ?? "",
      isPublished: payload.isPublished ?? true,
      currentUser: user,
    });

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    const status = error instanceof Error && error.message === "Knowledge document not found" ? 404 : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update knowledge document" },
      { status },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireRole("admin");
    const { documentId } = await context.params;
    await deleteKnowledgeDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete knowledge document" },
      { status: 400 },
    );
  }
}
