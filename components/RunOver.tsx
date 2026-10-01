"use client";

/*
 * Koşu sonu ekranı — iki sonuç, tek bileşen.
 *
 * ---------------------------------------------------------------------------
 * ARTIK KAZANILABİLİYOR
 * ---------------------------------------------------------------------------
 * Eskiden bu ekranın tek sebebi Revive'ın bitmesiydi: act'ler sonsuza kadar
 * tekrarlandığı için koşunun bir SONU yoktu, sadece bir ölümü vardı. Şimdi
 * Champion yenildiğinde koşu bitiyor ve bu ekran onu kutluyor.
 *
 * İki durum ayrı ayrı yazılmak zorunda: aynı ekranda "yenildin" ve "şampiyon
 * oldun" aynı tonla anlatılamaz.
 *
 * ---------------------------------------------------------------------------
 * ÖLÜMDEN SONRA NE KALIYOR
 * ---------------------------------------------------------------------------
 * Aktif koşunun hiçbir şeyi: takım, Box, altın, envanter, relic, rozet,
 * hikâye durumu, harita. Kalanlar sadece rekorlar ve tabloya yazılmış
 * sonuçlar. Ekran bunu açıkça söylüyor, oyuncu bir sonraki koşuya sıfırdan
 * başladığında şaşırmasın.
 */

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { computeRunScore } from "@/lib/game/score";
import type { RunRecords } from "@/lib/store/gameStore";

interface RunOverProps {
  /** Champion yenildi mi? */
  won: boolean;
  /** Nereye kadar gelindiği — act * satır + satır. */
  depth: number;
  bestLevel: number;
  bossesDefeated: number;
  badges: number;
  eliteFourDefeated: number;
  champion: boolean;
  trainerWins: number;
  records: RunRecords;
  /** Koşuya verilen ad; null ise oyuncu ad sormayı atlamıştı. */
  leaderboardName: string | null;
  /**
   * Koşunun tabloya yazılma durumu.
   *
   * Tablo paylaşılan bir sunucuda, yani yazma bir AĞ İSTEĞİ — ekran
   * açıldığında sonuç henüz bilinmiyor. Üç durumu ayırmak zorundayız, yoksa
   * ekran bir an yanlış bir şey yazıp sonra kendini düzeltiyor.
   */
  leaderboardStatus: "saving" | "recorded" | "missed";
  /**
   * Tablodaki satır bu koşuyla güncellendi mi?
   *
   * Tablo oyuncu başına EN İYİ koşuyu tutuyor, yani kabul edilmiş bir koşu
   * sıralamayı değiştirmeyebilir. Oyuncu "kaydedildi" yazısını görüp sırasının
   * neden aynı kaldığını merak etmesin diye ayrı söyleniyor.
   */
  leaderboardImproved?: boolean;
  /** Yazılamadıysa sebebi — "neden listede değilim" sorusunun cevabı. */
  rejection?: string | null;
  onRestart: () => void;
}

export function RunOver({
  won,
  depth,
  bestLevel,
  bossesDefeated,
  badges,
  eliteFourDefeated,
  champion,
  trainerWins,
  records,
  leaderboardName,
  leaderboardStatus,
  leaderboardImproved = true,
  rejection = null,
  onRestart,
}: RunOverProps) {
  // Puan, sunucunun kullandığı formülün aynısıyla hesaplanıyor — oyuncu
  // tabloda göreceği sayıyı burada da görüyor.
  const score = computeRunScore({
    bestLevel,
    badges,
    eliteFourDefeated,
    champion,
    trainerWins,
    depth,
    // Zorluk çarpanı skoru ölçekliyor; bu ekranda normal varsayılıyor çünkü
    // gösterilen şey "tabloya giden puan" değil onun tabanı.
    difficulty: "normal",
  });
  const isBestScore = score >= records.bestScore;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="parchment-card w-[min(94vw,30rem)] p-7 text-center"
        style={won ? { borderColor: "var(--poke-yellow)" } : undefined}
      >
        {won ? (
          <>
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.15 }}
            >
              <GameIcon
                name="medal"
                className="mx-auto h-12 w-12 text-[var(--poke-yellow)]"
              />
            </motion.div>
            <p className="ink-heading mt-2 text-xs">Hall of Fame</p>
            <h1 className="mt-2 text-2xl">You are the Champion</h1>
            <hr className="ink-rule mx-auto mt-4 w-2/3" />
            <p className="font-hand mt-4 text-[17px] italic text-[var(--ink-soft)]">
              Eight badges, the Elite Four, and the Champion. The run is
              complete.
            </p>
          </>
        ) : (
          <>
            <p className="ink-heading text-xs">The road ends here</p>
            <h1 className="mt-2 text-2xl">Your run is over</h1>
            <hr className="ink-rule mx-auto mt-4 w-2/3" />
            <p className="font-hand mt-4 text-[17px] italic text-[var(--ink-soft)]">
              You were beaten with no Revive left in the bag.
            </p>
          </>
        )}

        <dl className="mt-5 grid grid-cols-4 gap-2 text-sm">
          <Stat label="Badges" value={`${badges}/8`} />
          <Stat label="Elite Four" value={`${eliteFourDefeated}/4`} />
          <Stat label="Best level" value={`${bestLevel}`} />
          <Stat label="Trainers" value={`${trainerWins}`} />
        </dl>

        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <Stat label="Score" value={score.toLocaleString("en-US")} />
          <Stat label="Bosses" value={`${bossesDefeated}`} />
        </div>

        {isBestScore && score > 0 && (
          <p className="mt-4 text-sm font-semibold text-[var(--poke-red-dark)]">
            A new personal best.
          </p>
        )}

        {/*
          Skor tablosunun durumu.

          Atlandıysa, bilet alınamadıysa ya da sunucuya ulaşılamadıysa bunu
          AÇIKÇA söylüyoruz — oyuncu skorunun neden listede olmadığını bilmeli.
        */}
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          {leaderboardName === null
            ? "You skipped the name, so this run was not added to the leaderboard."
            : leaderboardStatus === "saving"
              ? `Sending this run to the leaderboard as ${leaderboardName}…`
              : leaderboardStatus === "recorded"
                ? leaderboardImproved
                  ? `New leaderboard best for ${leaderboardName}.`
                  : `Your leaderboard best as ${leaderboardName} still stands — this run did not beat it.`
                : `This run was not ranked, ${leaderboardName} — it is saved on this device.`}
        </p>
        {rejection !== null && leaderboardStatus === "missed" && (
          <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{rejection}</p>
        )}

        <p className="mt-5 text-xs text-[var(--ink-faint)]">
          Your next run starts from the wheel with one Revive. Nothing carries
          over except your records — no team, no box, no relics, no badges.
        </p>

        <button
          type="button"
          onClick={onRestart}
          autoFocus
          className="mt-6 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110"
        >
          Start a new run
        </button>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-panel px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
