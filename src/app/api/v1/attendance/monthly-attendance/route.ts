import { NextRequest, NextResponse } from "next/server";
import { getMonthlyAttendance } from "@/server/modules/attendance/monthly-attendance.service";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        {
          success: false,
          message: "Provide a valid month using YYYY-MM.",
        },
        { status: 400 },
      );
    }

    const parsedMonth = new Date(`${month}-01T00:00:00.000Z`);

    if (
      Number.isNaN(parsedMonth.getTime()) ||
      parsedMonth.toISOString().slice(0, 7) !== month
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid month." },
        { status: 400 },
      );
    }

    // Optional: when present, the response also includes one daily row per
    // calendar day of the month for that employee, so the Employee Details page
    // can show a full month without one request per day.
    const employeeIdParam = request.nextUrl.searchParams.get("employeeId");
    let employeeId: number | undefined;

    if (employeeIdParam !== null) {
      if (!/^\d+$/.test(employeeIdParam)) {
        return NextResponse.json(
          { success: false, message: "Provide a valid employeeId." },
          { status: 400 },
        );
      }

      const parsedEmployeeId = Number(employeeIdParam);

      if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
        return NextResponse.json(
          { success: false, message: "Provide a valid employeeId." },
          { status: 400 },
        );
      }

      employeeId = parsedEmployeeId;
    }

    const result = await getMonthlyAttendance(month, employeeId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Monthly attendance API failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to retrieve monthly attendance report.",
      },
      { status: 500 },
    );
  }
}
