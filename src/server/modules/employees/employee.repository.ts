
import { prisma } from "@/server/prisma";

export async function findAllEmployees() {
  return prisma.employee.findMany({
    orderBy: {
      employeeId: "asc",
    },
  });
}
