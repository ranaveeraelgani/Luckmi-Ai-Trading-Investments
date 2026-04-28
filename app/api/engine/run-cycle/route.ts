import { GET as marketCycleGET, maxDuration } from "@/app/api/cron/market-cycle/route";

export { maxDuration };

export async function GET(req: Request) {
  return marketCycleGET(req);
}