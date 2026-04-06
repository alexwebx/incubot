import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  setManagerPassword,
  unauthorizedResponse,
} from "@/lib/server/auth";

type RouteContext = {
  params: Promise<{
    managerId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireRole("admin");
    const { nextPassword } = (await request.json()) as { nextPassword?: string };

    if (!nextPassword?.trim()) {
      return NextResponse.json({ error: "nextPassword is required" }, { status: 400 });
    }

    if (nextPassword.trim().length < 8) {
      return NextResponse.json(
        { error: "Password must contain at least 8 characters" },
        { status: 400 },
      );
    }

    const { managerId } = await context.params;
    await setManagerPassword(managerId, nextPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password update failed" },
      { status: 400 },
    );
  }
}
