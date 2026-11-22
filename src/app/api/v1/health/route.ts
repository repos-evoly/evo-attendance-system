
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      success: true,
      data: {
        api: "healthy",
        database: "connected",
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        success: false,
        data: {
          api: "healthy",
          database: "disconnected",
        },
      },
      { status: 503 },
    );
  }
}
