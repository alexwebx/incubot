import { NextResponse } from "next/server";
import { listManagers, requireUser, unauthorizedResponse } from "@/lib/server/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const managers = await listManagers(user);

    return NextResponse.json({ managers });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load managers" },
      { status: 500 },
    );
  }
}
