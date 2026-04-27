import LuckmiAiIcon from "@/components/brand/LuckmiAiIcon";

export default function AiAnalysisCard() {
  return (
    <div className="rounded-3xl border border-white/5 bg-[#11151C] p-6 shadow-lg">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <LuckmiAiIcon />
          AI Analysis
        </div>

        <span className="text-xs text-emerald-400">Bullish</span>
      </div>

      <div className="mt-6 text-center">
        <div className="text-4xl font-bold text-white">72%</div>
        <div className="mt-2 text-sm text-gray-400">
          Strong upward momentum detected
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        Based on CTS, RSI, MACD alignment
      </div>
    </div>
  );
}