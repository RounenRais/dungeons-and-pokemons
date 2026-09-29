/* One-process acceptance smoke for the complete run lifecycle. */

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
(globalThis as unknown as { localStorage: Storage }).localStorage = storage as Storage;

delete process.env.DATABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.LEADERBOARD_SECRET = "full-run-smoke-secret-2026";

const { validateName } = await import("../lib/game/leaderboardSchema");
const { issueRunTicket } = await import("../lib/server/runTicket");
const { resetMemoryStore } = await import("../lib/server/leaderboardStore");
const { useGameStore, buildRunSummary } = await import("../lib/store/gameStore");
const { createTeamMember } = await import("../lib/game/team");
const { getPokemon, getMoves, selectStartingMoveIds } = await import("../lib/pokeapi");
const { getGymLeaderForSlot } = await import("../lib/data/gymLeaders");
const { getEliteFourEncounter, getStageEncounter, TOTAL_ACTS } = await import("../lib/game/league");
const { getCasinoGame } = await import("../lib/game/casinoState");

let failures = 0;
function check(label: string, value: unknown, expected: unknown) {
  const ok = JSON.stringify(value) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} → ${JSON.stringify(value)}`);
}

const name = validateName("  Red  ");
check("valid player name is trimmed", name.name, "Red");

const ticket = issueRunTicket();
useGameStore.getState().newGame();
useGameStore.getState().setPlayerName(name.name);
useGameStore.getState().setRunTicket(ticket);

const starter = await getPokemon("pikachu");
const starterMoves = await getMoves(selectStartingMoveIds(starter, 5));
const starterMember = createTeamMember(starter, { level: 5, moves: starterMoves, isShiny: false });
useGameStore.getState().startWithStarter(starter, starterMember);
check("starter starts the run", useGameStore.getState().player.team.length, 1);
check("server seed drives the map", useGameStore.getState().seed, ticket.seed);

const caught = await getPokemon("rattata");
const caughtMoves = await getMoves(selectStartingMoveIds(caught, 5));
let lastDestination = "";
for (let index = 0; index < 6; index += 1) {
  const member = createTeamMember(caught, { level: 5 + index, moves: caughtMoves, isShiny: false });
  lastDestination = useGameStore.getState().storeCaughtPokemon(member);
}
check("party caps at six", useGameStore.getState().player.team.length, 6);
check("seventh Pokémon goes to Box", lastDestination, "box");
check("Box receives the catch", useGameStore.getState().box.length, 1);

const boxedId = useGameStore.getState().box[0].instanceId;
check("confirmed release succeeds", useGameStore.getState().releaseMember(boxedId), null);
check("released Pokémon is gone", useGameStore.getState().box.length, 0);
check("double release is rejected", useGameStore.getState().releaseMember(boxedId), "not-found");
check("release is written to the run log", useGameStore.getState().log[0].tone, "bad");

const roll = {
  key: "smoke#0:stand-ground", roll: 14, modifier: 2, total: 16, dc: 13,
  tier: "success" as const, isNatural20: false, isNatural1: false, rolledAt: 1,
};
useGameStore.getState().recordCheck(roll);
useGameStore.getState().recordCheck({ ...roll, roll: 1, total: 3, tier: "failure", isNatural1: true });
check("d20 result cannot be rerolled by replay", useGameStore.getState().story.resolvedChecks[roll.key].roll, 14);
useGameStore.getState().completeStoryEvent({ eventId: "smoke-event", choiceId: "stand-ground", occurrence: 0, checkTier: "success", act: 0, at: 1 }, true);
check("D&D choice closes the authored event", useGameStore.getState().story.completedEvents.includes("smoke-event"), true);

useGameStore.getState().addGold(2000);
const casinoNode = Array.from({ length: 100 }, (_, i) => `smoke-casino-${i}`).find((id) => getCasinoGame(id) === "slots")!;
check("casino opens once in the act", useGameStore.getState().openCasino(casinoNode), true);
check("casino second visit is blocked", useGameStore.getState().openCasino(`${casinoNode}-other`), false);
check("casino spin is atomically settled", useGameStore.getState().playSpin(10, 1).ok, true);

useGameStore.getState().addRelic("iron-shell");
useGameStore.getState().addRelic("iron-shell");
check("duplicate relic upgrades instead of using a slot", useGameStore.getState().relics[0].level, 2);
check("duplicate relic still occupies one slot", useGameStore.getState().relics.length, 1);

for (let slot = 0; slot < 8; slot += 1) {
  const leader = getGymLeaderForSlot(ticket.seed, slot);
  check(`Gym ${slot + 1} badge awarded once`, useGameStore.getState().awardBadge(leader.badge), true);
  useGameStore.getState().claimBoon({ id: leader.badge.boons[0], badgeId: leader.badge.id, type: leader.badge.type });
  useGameStore.getState().registerTrainerWin(leader.id);
}
check("eight badges complete the Gym road", useGameStore.getState().league.badges.length, 8);

useGameStore.getState().beginEliteFour();
for (let index = 0; index < 4; index += 1) {
  const member = getEliteFourEncounter(ticket.seed, index).trainer;
  useGameStore.getState().registerTrainerWin(member.id);
  useGameStore.getState().completeEliteFourMember(member.id);
  if (index < 3) useGameStore.getState().applyRelief("press-on");
}
check("Elite Four is four consecutive members", useGameStore.getState().league.eliteFourDefeated.length, 4);

useGameStore.setState((state) => ({
  player: {
    ...state.player,
    team: state.player.team.map((member, index) => index === 0 ? { ...member, level: 100 } : member),
  },
}));
const championEncounter = getStageEncounter(ticket.seed, TOTAL_ACTS - 1);
if (championEncounter === null || championEncounter.kind !== "champion") {
  throw new Error("Champion encounter missing");
}
const champion = championEncounter.trainer;
useGameStore.getState().completeChampionRun(champion.id);
check("Champion completes the run", useGameStore.getState().phase, "victory");

const summary = buildRunSummary(useGameStore.getState());
check("champion summary is leaderboard-valid", summary.champion, true);
resetMemoryStore();
const leaderboard = await import("../app/api/leaderboard/route");
const response = await leaderboard.POST(new Request("http://localhost/api/leaderboard", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": "full-run-smoke" },
  body: JSON.stringify({ name: name.name, run: summary, ticket }),
}));
check("Champion score reaches public leaderboard API", response.status, 200);
const body = await response.json();
check("leaderboard records the champion", body.entry.champion, true);

const championships = useGameStore.getState().records.championships;
useGameStore.getState().newGame();
check("new run clears active party", useGameStore.getState().player.team.length, 0);
check("new run clears Box", useGameStore.getState().box.length, 0);
check("new run keeps meta records", useGameStore.getState().records.championships, championships);

console.log(failures === 0 ? "\nFULL RUN SMOKE OK" : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
