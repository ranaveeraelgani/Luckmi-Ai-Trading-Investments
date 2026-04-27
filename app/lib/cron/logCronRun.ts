import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type StartCronRunInput = {
  jobName: string;
};

type FinishCronRunInput = {
  runId: string;
  status: "success" | "failed" | "skipped";
  skipped?: boolean;
  skipReason?: string | null;
  usersProcessed?: number;
  usersUpdated?: number;
  stocksProcessed?: number;
  tradesExecuted?: number;
  errorMessage?: string | null;
  result?: any;
  startedAt: number;
};

export async function startCronRun({ jobName }: StartCronRunInput) {
  const { data, error } = await supabaseAdmin
    .from("cron_runs")
    .insert({
      job_name: jobName,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to start cron run log:", error);
    return null;
  }

  return data.id as string;
}

export async function finishCronRun({
  runId,
  status,
  skipped = false,
  skipReason = null,
  usersProcessed = 0,
  usersUpdated = 0,
  stocksProcessed = 0,
  tradesExecuted = 0,
  errorMessage = null,
  result = null,
  startedAt,
}: FinishCronRunInput) {
  const durationMs = Date.now() - startedAt;

  const { error } = await supabaseAdmin
    .from("cron_runs")
    .update({
      status,
      skipped,
      skip_reason: skipReason,
      users_processed: usersProcessed,
      users_updated: usersUpdated,
      stocks_processed: stocksProcessed,
      trades_executed: tradesExecuted,
      error_message: errorMessage,
      result,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq("id", runId);

  if (error) {
    console.error("Failed to finish cron run log:", error);
  }
}