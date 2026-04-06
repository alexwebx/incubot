import { NextResponse } from "next/server";
import { registerManager } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const { email, fullName, password } = (await request.json()) as {
      email?: string;
      fullName?: string;
      password?: string;
    };

    if (!email?.trim() || !fullName?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "fullName, email and password are required" },
        { status: 400 },
      );
    }

    if (password.trim().length < 8) {
      return NextResponse.json(
        { error: "Password must contain at least 8 characters" },
        { status: 400 },
      );
    }

    const user = await registerManager({ email, fullName, password });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
}
