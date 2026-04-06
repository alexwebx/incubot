import { NextResponse } from "next/server";
import { recoverPassword } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };

    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const nextPassword = await recoverPassword(email);

    if (!nextPassword) {
      return NextResponse.json({
        success: true,
        message: "Если аккаунт существует, новый пароль уже сгенерирован.",
      });
    }

    return NextResponse.json({
      success: true,
      message: `Новый пароль: ${nextPassword}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recovery failed" },
      { status: 400 },
    );
  }
}
