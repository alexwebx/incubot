import { NextResponse } from "next/server";
import { requireUser, unauthorizedResponse } from "@/lib/server/auth";
import { loadInboxData } from "@/lib/server/dialogs";

export async function GET() {
  try {
    const user = await requireUser();
    const inbox = await loadInboxData(user);

    return NextResponse.json(inbox);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load inbox" },
      { status: 500 },
    );
  }
}
