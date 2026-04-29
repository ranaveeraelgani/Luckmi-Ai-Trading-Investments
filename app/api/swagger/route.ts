import { NextResponse } from "next/server";
import { swaggerSpec } from "@/app/lib/swagger";

export async function GET() {
  return NextResponse.json(swaggerSpec);
}
