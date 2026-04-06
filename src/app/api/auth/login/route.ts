import { NextResponse } from "next/server";
import { loginUser } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await loginUser(email, password);

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 400 },
    );
  }
}
