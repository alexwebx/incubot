import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { reindexKnowledgeDocument } from "@/lib/server/knowledge";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireRole("admin");
    const { documentId } = await context.params;
    const document = await reindexKnowledgeDocument(documentId, user);

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
      { error: error instanceof Error ? error.message : "Failed to reindex knowledge document" },
      { status },
    );
  }
}
