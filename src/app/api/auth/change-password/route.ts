import { NextResponse } from "next/server";
import { changeOwnPassword, requireUser, unauthorizedResponse } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { currentPassword, nextPassword } = (await request.json()) as {
      currentPassword?: string;
      nextPassword?: string;
    };

    if (!currentPassword?.trim() || !nextPassword?.trim()) {
      return NextResponse.json(
        { error: "currentPassword and nextPassword are required" },
        { status: 400 },
      );
    }

    if (nextPassword.trim().length < 8) {
      return NextResponse.json(
        { error: "Password must contain at least 8 characters" },
        { status: 400 },
      );
    }

    await changeOwnPassword(user.id, currentPassword, nextPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password change failed" },
      { status: 400 },
    );
  }
}
