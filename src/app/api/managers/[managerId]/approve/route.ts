import { NextResponse } from "next/server";
import {
  approveManager,
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/server/auth";

type RouteContext = {
  params: Promise<{
    managerId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const adminUser = await requireRole("admin");
    const { managerId } = await context.params;
    const manager = await approveManager(managerId, adminUser);

    return NextResponse.json({ manager });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 400 },
    );
  }
}
