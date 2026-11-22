import { NextRequest, NextResponse } from "next/server";
import { getDailyAttendance } from "@/server/modules/attendance/attendance.service";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        {
          success: false,
          message: "Provide a valid date using YYYY-MM-DD.",
        },
        { status: 400 },
      );
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid date." },
        { status: 400 },
      );
    }

    const result = await getDailyAttendance(date);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Daily attendance API failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to retrieve daily attendance.",
      },
      { status: 500 },
    );
  }
}