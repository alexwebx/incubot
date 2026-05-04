import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/server/auth";
import {
  createKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/lib/server/knowledge";

export async function GET() {
  try {
    await requireRole("admin");
    const documents = await listKnowledgeDocuments();

    return NextResponse.json({ documents });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load knowledge base" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    const payload = (await request.json()) as {
      title?: string;
      content?: string;
      isPublished?: boolean;
    };

    const document = await createKnowledgeDocument({
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

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create knowledge document" },
      { status: 400 },
    );
  }
}
