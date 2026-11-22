
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/prisma";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { employeeId } = await params;
    const id = Number(employeeId);

    // Validate employee ID
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid employee ID",
        },
        { status: 400 }
      );
    }

    // Find employee by ID
    const employee = await prisma.employee.findUnique({
      where: {
        employeeId: id,
      },
    });

    // Employee not found
    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          message: "Employee not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    console.error("Get employee failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
