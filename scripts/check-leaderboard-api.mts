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
check("first write is not duplicate", acceptedBody.duplicate, false);

const duplicate = await leaderboard.POST(post({ name: "Ash", ticket: runTicket, run: summary }, "127.0.0.7"));
const duplicateBody = await duplicate.json();
check("same run ticket is idempotent", duplicateBody.duplicate, true);
check("duplicate does not add a second row", duplicateBody.total, 1);

const page = await leaderboard.GET(new Request("http://localhost/api/leaderboard?limit=1&offset=0"));
const pageBody = await page.json();
check("GET exposes the shared server page", page.status, 200);
check("GET page contains the run", pageBody.entries.length, 1);
check("GET reports total", pageBody.total, 1);
check("GET reports no further page", pageBody.hasMore, false);

console.log(failures === 0 ? "\nLEADERBOARD API OK" : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
