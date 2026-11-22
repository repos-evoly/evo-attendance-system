
import { NextResponse } from "next/server";
import { getEmployees } from "@/server/modules/employees/employee.service";

export async function GET() {
  try {
    const employees = await getEmployees();

    return NextResponse.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error("Failed to fetch employees:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch employees",
      },
      { status: 500 },
    );
  }
}
