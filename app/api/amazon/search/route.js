import { NextResponse } from "next/server";
import { searchAmazon, amazonEnabled } from "../../../../lib/amazonCreators";

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [], status: "no_query" });
  if (!amazonEnabled()) return NextResponse.json({ items: [], status: "disabled" });
  const result = await searchAmazon(q);
  return NextResponse.json(result);
}
