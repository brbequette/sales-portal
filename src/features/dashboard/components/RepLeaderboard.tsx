export function RepLeaderboard({ reps }: { reps: any[] }) {
  if (!reps || reps.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
      <h3 className="text-lg font-semibold text-white mb-4">Top Performers</h3>
      <div className="space-y-4">
        {reps.map((rep, index) => (
          <div key={rep.name || index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold">
                {index + 1}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{rep.name}</p>
                <p className="text-xs text-neutral-400">{rep.deals} deals</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-400">${rep.sales?.toLocaleString()}</p>
              <p className="text-xs text-neutral-400">Profit: ${rep.profit?.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
