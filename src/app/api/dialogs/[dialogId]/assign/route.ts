import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireUser,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { assignDialog, findDialogById } from "@/lib/server/dialogs";

type RouteContext = {
  params: Promise<{
    dialogId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { dialogId } = await context.params;
    const dialog = await findDialogById(dialogId);

    if (!dialog) {
      return NextResponse.json({ error: "Dialog not found" }, { status: 404 });
    }

    const { managerId } = (await request.json()) as { managerId?: string };
    const trimmedManagerId = managerId?.trim();

    if (!trimmedManagerId) {
      return NextResponse.json({ error: "managerId is required" }, { status: 400 });
    }

    const assignment = await assignDialog(dialogId, trimmedManagerId, user);

    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign dialog" },
      { status: 400 },
    );
  }
}
