
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";

export async function GET() {
  try {
    const shifts = await prisma.shift.findMany({
      orderBy: {
        shiftId: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: shifts,
    });
  } catch (error) {
    console.error("Get shifts failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
