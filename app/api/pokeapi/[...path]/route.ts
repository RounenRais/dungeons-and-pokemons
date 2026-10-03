// PokeAPI'ye kendi domainimiz üzerinden giden yedek yol.
//
// ---------------------------------------------------------------------------
// NEDEN
// ---------------------------------------------------------------------------
// İstemci PokeAPI'ye doğrudan gidiyor (CLAUDE.md: kendi backend'imiz yok). Ama
// bazı oyuncuların tarayıcısı `pokeapi.co`'ya hiç ulaşamıyor: okul/iş ağı
// filtresi, DNS engeli, gizlilik eklentisi ya da Cloudflare'in o IP'ye
// gösterdiği bot doğrulaması (CORS başlığı olmadığı için tarayıcıda
// "Failed to fetch" olarak görünüyor). Oyunu açabilen biri bizim domainimize
// zaten ulaşıyor; doğrudan istek ağ hatası verince `lib/pokeapi/client.ts`
// aynı isteği buraya yolluyor.
//
// ---------------------------------------------------------------------------
// AÇIK PROXY DEĞİL
// ---------------------------------------------------------------------------
// Sadece istemcinin kullandığı kaynaklar, sadece GET ve sadece güvenli
// karakterler geçiyor; hedef host sabit.

export const dynamic = "force-dynamic";

const UPSTREAM = "https://pokeapi.co/api/v2";
const UPSTREAM_TIMEOUT_MS = 10_000;

/** İstemcinin (`lib/pokeapi/client.ts`) istediği kaynaklar. */
const ALLOWED_RESOURCES = new Set([
  "pokemon",
  "pokemon-species",
  "move",
  "evolution-chain",
  "machine",
]);

const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
/** Liste uçlarında (`pokemon?limit=1`) yalnızca sayfalama parametreleri. */
const ALLOWED_QUERY = new Set(["limit", "offset"]);

/** PokeAPI verisi neredeyse hiç değişmiyor: tarayıcı ve CDN bir gün tutsun. */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400";

function badRequest(): Response {
  return Response.json({ error: "Unsupported PokeAPI path." }, { status: 400 });
}

function buildUpstreamUrl(segments: string[], search: URLSearchParams): string | null {
  const [resource, id, ...rest] = segments;
  if (resource === undefined || rest.length > 0) return null;
  if (!ALLOWED_RESOURCES.has(resource)) return null;
  if (id !== undefined && !ID_PATTERN.test(id)) return null;

  const query = new URLSearchParams();
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY.has(key) || !/^\d{1,5}$/.test(value)) return null;
    query.set(key, value);
  }

  const path = id === undefined ? resource : `${resource}/${id}`;
  const qs = query.toString();
  return `${UPSTREAM}/${path}${qs === "" ? "" : `?${qs}`}`;
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/pokeapi/[...path]">,
): Promise<Response> {
  const { path } = await ctx.params;
  const upstreamUrl = buildUpstreamUrl(path, new URL(request.url).searchParams);
  if (upstreamUrl === null) return badRequest();

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Cloudflare Workers: alt isteği kenar önbelleğinde tut.
      cf: { cacheTtl: 86_400, cacheEverything: true },
    } as RequestInit);

    if (!upstream.ok) {
      return Response.json(
        { error: `PokeAPI returned ${upstream.status}.` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch {
    return Response.json({ error: "PokeAPI is unreachable." }, { status: 502 });
  }
}
