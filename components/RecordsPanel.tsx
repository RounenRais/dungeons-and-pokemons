"use client";

// Koşular arası kalan rekorlar — yeni bir maceraya başlarken hedef verir.

import type { RunRecords } from "@/lib/store/gameStore";

interface RecordsPanelProps {
  records: RunRecords;
}

export function RecordsPanel({ records }: RecordsPanelProps) {
  if (records.totalRuns === 0) return null;

  const rows: { label: string; value: string }[] = [
    { label: "Deepest run", value: `${records.bestDistance}` },
    { label: "Highest level", value: `${records.bestLevel}` },
    { label: "Longest streak", value: `${records.bestStreak}` },
    { label: "Bosses beaten", value: `${records.totalBossesDefeated}` },
    { label: "Relics found", value: `${records.totalRelics}` },
    { label: "Runs played", value: `${records.totalRuns}` },
  ];

  return (
    <section className="parchment-card w-[min(92vw,30rem)] px-4 py-3">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Your records
      </h2>
      <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] text-[var(--ink-faint)]">{row.label}</dt>
            <dd className="font-mono text-sm text-[var(--ink)]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
