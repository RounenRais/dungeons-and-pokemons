/* Public leaderboard route: ticket, validation, scoring, duplicate and paging. */

import { computeRunScore, type RunSummary } from "@/lib/game/score";
import { resetMemoryStore } from "@/lib/server/leaderboardStore";

delete process.env.DATABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.LEADERBOARD_SECRET = "leaderboard-test-secret-2026";
resetMemoryStore();

const leaderboard = await import("../app/api/leaderboard/route");
const runRoute = await import("../app/api/leaderboard/run/route");
const nameRoute = await import("../app/api/leaderboard/name/route");

/** Tablo oyuncu başına tek satır tutuyor; satırın anahtarı bu. */
const PLAYER_A = "player-aaaaaaaaaaaa";
const PLAYER_B = "player-bbbbbbbbbbbb";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  → ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

function post(body: unknown, ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    // Kimlik testlerin çoğunda sabit; kendi `playerId`sini veren çağrı onu ezer.
    body: JSON.stringify({ playerId: PLAYER_A, ...(body as object) }),
  });
}

function namePost(body: unknown, ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/leaderboard/name", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function ticket(ip = "127.0.0.1") {
  const response = await runRoute.POST(new Request("http://localhost/api/leaderboard/run", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  }));
  check("run ticket endpoint succeeds", response.status, 200);
  const body = await response.json();
  check("development fallback is explicit memory storage", body.storage, "memory");
  return body.ticket;
}

const summary: RunSummary = {
  bestLevel: 100,
  badges: 8,
  eliteFourDefeated: 4,
  champion: true,
  trainerWins: 24,
  depth: 140,
  difficulty: "hard",
};

const runTicket = await ticket();

const missingTicket = await leaderboard.POST(post({ name: "Ash", run: summary }, "127.0.0.2"));
check("submission without signed ticket is rejected", missingTicket.status, 403);

const shortName = await leaderboard.POST(post({ name: "ab", run: summary, ticket: runTicket }, "127.0.0.3"));
check("short name is rejected server-side", shortName.status, 400);

const impossible = await leaderboard.POST(post({
  name: "Cheater",
  ticket: runTicket,
  run: { ...summary, badges: 0, eliteFourDefeated: 4 },
}, "127.0.0.4"));
check("impossible progression is rejected", impossible.status, 422);

const huge = await leaderboard.POST(post({
  name: "Cheater",
  ticket: runTicket,
  run: { ...summary, bestLevel: 999999 },
}, "127.0.0.5"));
check("out-of-range raw values are rejected instead of clamped", huge.status, 422);

const accepted = await leaderboard.POST(post({
  name: "  Ash  ",
  ticket: runTicket,
  run: summary,
  score: 999999999,
}, "127.0.0.6"));
check("valid champion run is accepted", accepted.status, 200);
const acceptedBody = await accepted.json();
check("name is trimmed", acceptedBody.entry.name, "Ash");
check("client score is ignored and recomputed", acceptedBody.entry.score, computeRunScore(summary));
check("first write improves the row", acceptedBody.improved, true);
check("entry is keyed by the player, not the run", acceptedBody.entry.id, PLAYER_A);

/*
 * Tablo OYUNCU başına tek satır tutuyor.
 *
 * Aynı oyuncudan gelen ikinci bir koşu yeni satır açmıyor: daha iyiyse satırı
 * güncelliyor, daha kötüyse hiçbir şey değiştirmiyor.
 */
const weaker = await leaderboard.POST(post({
  name: "Ash",
  ticket: runTicket,
  run: { ...summary, bestLevel: 20, badges: 0, eliteFourDefeated: 0, champion: false, trainerWins: 1 },
}, "127.0.0.7"));
const weakerBody = await weaker.json();
check("a weaker run does not replace the record", weakerBody.improved, false);
check("a weaker run does not add a second row", weakerBody.total, 1);
check("the stored score is still the best one", weakerBody.entries[0].score, computeRunScore(summary));

const betterSummary: RunSummary = { ...summary, trainerWins: 40 };
const better = await leaderboard.POST(post({
  name: "Ash",
  ticket: runTicket,
  run: betterSummary,
}, "127.0.0.8"));
const betterBody = await better.json();
check("a better run updates the row", betterBody.improved, true);
check("a better run still leaves one row", betterBody.total, 1);
check("the row now holds the better score", betterBody.entries[0].score, computeRunScore(betterSummary));

// --- Ad benzersizliği -----------------------------------------------------

const taken = await leaderboard.POST(post({
  playerId: PLAYER_B,
  name: "Ash",
  ticket: runTicket,
  run: summary,
}, "127.0.0.9"));
check("another player cannot submit under a taken name", taken.status, 409);

const claimTaken = await nameRoute.POST(namePost({ playerId: PLAYER_B, name: "ash" }, "127.0.1.1"));
check("claiming a taken name is refused, case-insensitively", claimTaken.status, 409);

const claimFree = await nameRoute.POST(namePost({ playerId: PLAYER_B, name: "Misty" }, "127.0.1.2"));
check("a free name can be claimed", claimFree.status, 200);

const renamed = await nameRoute.POST(namePost({ playerId: PLAYER_A, name: "Red" }, "127.0.1.3"));
check("a player can rename", renamed.status, 200);
const afterRename = await leaderboard.GET(new Request("http://localhost/api/leaderboard?limit=10&offset=0"));
const afterRenameBody = await afterRename.json();
check("renaming moves the existing score to the new name", afterRenameBody.entries[0].name, "Red");
check("renaming does not add a row", afterRenameBody.total, 1);

const reuseOld = await nameRoute.POST(namePost({ playerId: PLAYER_B, name: "Ash" }, "127.0.1.4"));
check("the freed name can be taken by someone else", reuseOld.status, 200);

/*
 * Ad, ilk koşu bitmeden de KİLİTLİ.
 *
 * Rezervasyon olmasaydı iki oyuncu aynı adı alabilir ve ad ancak biri koşuyu
 * bitirince gerçekten sahiplenilirdi — yani yarışı kaybeden adını kaybederdi.
 */
const PLAYER_C = "player-cccccccccccc";
const reserved = await nameRoute.POST(namePost({ playerId: PLAYER_C, name: "Ash" }, "127.0.1.5"));
check("a reserved name is locked before the first run", reserved.status, 409);

const page = await leaderboard.GET(new Request("http://localhost/api/leaderboard?limit=1&offset=0"));
const pageBody = await page.json();
check("GET exposes the shared server page", page.status, 200);
check("GET page contains the run", pageBody.entries.length, 1);
check("GET reports total", pageBody.total, 1);
check("GET reports no further page", pageBody.hasMore, false);
check("reservations without a run are not listed", pageBody.total, 1);

console.log(failures === 0 ? "\nLEADERBOARD API OK" : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
