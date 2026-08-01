import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

export type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const canonicalOrigin = "https://machi-npo.yhay81.com";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const telemetryNames = new Set([
  "visited",
  "prefecture_selected",
  "searched",
  "filtered",
  "saved",
  "official_opened",
  "shortlist_copied",
  "returned",
]);
const regions = [
  [
    "北海道・東北",
    [
      ["01", "北海道"],
      ["02", "青森"],
      ["03", "岩手"],
      ["04", "宮城"],
      ["05", "秋田"],
      ["06", "山形"],
      ["07", "福島"],
    ],
  ],
  [
    "関東",
    [
      ["08", "茨城"],
      ["09", "栃木"],
      ["10", "群馬"],
      ["11", "埼玉"],
      ["12", "千葉"],
      ["13", "東京"],
      ["14", "神奈川"],
    ],
  ],
  [
    "甲信越・北陸",
    [
      ["15", "新潟"],
      ["16", "富山"],
      ["17", "石川"],
      ["18", "福井"],
      ["19", "山梨"],
      ["20", "長野"],
    ],
  ],
  [
    "東海",
    [
      ["21", "岐阜"],
      ["22", "静岡"],
      ["23", "愛知"],
      ["24", "三重"],
    ],
  ],
  [
    "近畿",
    [
      ["25", "滋賀"],
      ["26", "京都"],
      ["27", "大阪"],
      ["28", "兵庫"],
      ["29", "奈良"],
      ["30", "和歌山"],
    ],
  ],
  [
    "中国",
    [
      ["31", "鳥取"],
      ["32", "島根"],
      ["33", "岡山"],
      ["34", "広島"],
      ["35", "山口"],
    ],
  ],
  [
    "四国",
    [
      ["36", "徳島"],
      ["37", "香川"],
      ["38", "愛媛"],
      ["39", "高知"],
    ],
  ],
  [
    "九州・沖縄",
    [
      ["40", "福岡"],
      ["41", "佐賀"],
      ["42", "長崎"],
      ["43", "熊本"],
      ["44", "大分"],
      ["45", "宮崎"],
      ["46", "鹿児島"],
      ["47", "沖縄"],
    ],
  ],
] as const;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new ApiError("cross_site_request", 403);
};

const parseJson = async (c: AppContext, maximumBytes = 256) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError("unsupported_media_type", 415);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new ApiError("payload_too_large", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const recordEvent = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-machi-npo-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(await sha256(session), name, c.req.header("x-machi-npo-qa") === "1" ? 1 : 0, nowSeconds())
    .run();
};

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width,initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content="まちのNPO" property="og:site_name" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#2d4d52" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      <script defer src="/app.js" />
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ
      </a>
      <header class="site-header">
        <a aria-label="まちのNPO ホーム" class="wordmark" href="/">
          <span aria-hidden="true" class="pin-mark">
            <i />
            <i />
            <i />
          </span>
          <span>まちのNPO</span>
        </a>
        <nav aria-label="案内">
          <a href="/guide">使い方</a>
          <a href="/source">出典</a>
          <a href="/privacy">保存</a>
        </nav>
      </header>
      {children}
      <footer class="site-footer">
        <span>出典：内閣府 NPO法人ポータルサイト 行政入力情報</span>
        <span>
          <a href="https://www.npo-homepage.go.jp/npoportal/index.php" rel="noopener noreferrer">
            公式ポータル
          </a>
          <a href="https://www.cao.go.jp/notice/rule.html" rel="noopener noreferrer">
            利用規約
          </a>
        </span>
      </footer>
    </body>
  </html>
);

const DirectoryScene = () => (
  <div aria-hidden="true" class="directory-scene">
    <div class="map-board">
      <i class="island north" />
      <i class="island east" />
      <i class="island center" />
      <i class="island west" />
      <i class="island south" />
      <span class="map-pin p1" />
      <span class="map-pin p2" />
      <span class="map-pin p3" />
      <span class="map-pin p4" />
    </div>
    <div class="card-cabinet">
      <span>
        <b>福祉</b>
        <i />
      </span>
      <span>
        <b>まち</b>
        <i />
      </span>
      <span>
        <b>文化</b>
        <i />
      </span>
      <span>
        <b>環境</b>
        <i />
      </span>
      <strong>49,062</strong>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/`}
    description="内閣府の行政入力情報から、解散情報が空欄の49,062 NPO法人を都道府県、活動分野、名前、目的のことばで探せます。"
    title="地域と活動分野からNPO法人を探す | まちのNPO"
  >
    <main class="home" id="main">
      <section class="directory-intro" aria-labelledby="product-title">
        <div class="product-heading">
          <p class="eyebrow">47 PREFECTURES / 20 FIELDS</p>
          <h1 id="product-title">地域から、活動する法人を見つける。</h1>
          <p>まちと活動分野を選び、法人の目的を同じカードで確かめます。</p>
          <div class="data-stamp">
            <strong>49,062</strong>
            <span>
              解散情報が空欄の法人
              <br />
              2026-07-31 時点
            </span>
          </div>
        </div>
        <DirectoryScene />
      </section>

      <div class="source-ribbon">
        <span>内閣府</span>
        <span>行政入力情報</span>
        <span>47都道府県</span>
        <span>番地・代表者名は不使用</span>
        <a href="/source">データの範囲</a>
      </div>

      <section class="prefecture-deck" aria-labelledby="prefecture-heading">
        <header class="section-heading">
          <div>
            <p>地域の引き出し</p>
            <h2 id="prefecture-heading">都道府県を一つ選ぶ</h2>
          </div>
          <output id="directory-total">49,062法人</output>
        </header>
        <div class="region-grid">
          {regions.map(([region, prefectures]) => (
            <section class="region-card">
              <h3>{region}</h3>
              <div>
                {prefectures.map(([code, name]) => (
                  <button data-prefecture={code} type="button">
                    <span>{name}</span>
                    <small data-prefecture-count={code}>—</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section class="directory-workspace" hidden id="directory-workspace">
        <section class="search-desk" aria-labelledby="search-heading">
          <header class="desk-heading">
            <div>
              <p>選んだ地域</p>
              <h2 id="search-heading">法人を探す</h2>
            </div>
            <button id="change-prefecture" type="button">
              地域を選び直す
            </button>
          </header>
          <div class="selected-prefecture">
            <span id="prefecture-badge">—</span>
            <strong id="prefecture-name">—</strong>
            <output id="prefecture-count">—法人</output>
          </div>
          <label class="organization-search" for="organization-search">
            <span>法人名・目的・市区町村から</span>
            <span class="search-box">
              <i aria-hidden="true">⌕</i>
              <input
                autocomplete="off"
                id="organization-search"
                placeholder="子ども、環境、〇〇市…"
                type="search"
              />
            </span>
          </label>
          <fieldset class="activity-filter">
            <legend>活動分野を重ねる</legend>
            <div id="activity-buttons">
              <p>活動分野を読み込んでいます…</p>
            </div>
            <button class="reset-filters" id="reset-filters" type="button">
              条件を外す
            </button>
          </fieldset>
          <p id="search-status" role="status">
            都道府県のデータを開いています…
          </p>
        </section>

        <section class="result-and-shortlist">
          <section class="organization-results" aria-labelledby="result-heading">
            <header class="result-heading">
              <div>
                <p>法人カード</p>
                <h2 id="result-heading">見つかった法人</h2>
              </div>
              <output id="result-count">—件</output>
            </header>
            <div class="organization-grid" id="organization-grid">
              <p class="loading-note">地域のカード箱を開いています…</p>
            </div>
            <button class="load-more" hidden id="load-more" type="button">
              次の50件を見る
            </button>
          </section>
          <aside class="shortlist" aria-labelledby="shortlist-heading">
            <header>
              <div>
                <p>気になる箱</p>
                <h2 id="shortlist-heading">あとで確かめる</h2>
              </div>
              <output id="shortlist-count">0 / 12</output>
            </header>
            <div id="shortlist-items">
              <p>法人カードの「気になる」を押すと、端末内の箱へ残せます。</p>
            </div>
            <div class="shortlist-actions">
              <button disabled id="copy-shortlist" type="button">
                一覧をコピー
              </button>
              <button class="clear-button" disabled id="clear-shortlist" type="button">
                すべて外す
              </button>
            </div>
          </aside>
        </section>
      </section>
    </main>
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="まちのNPOで地域と活動分野から法人を探し、公式記録を確認する方法。"
    title="使い方 | まちのNPO"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">町</span>
        <div>
          <p>使い方</p>
          <h1>地域のカード箱から探す</h1>
        </div>
      </header>
      <div class="instruction-grid">
        <section>
          <b>一</b>
          <h2>都道府県を選ぶ</h2>
          <p>全国を一度に読み込まず、探したい地域の法人データだけを端末へ開きます。</p>
        </section>
        <section>
          <b>二</b>
          <h2>ことばと活動で絞る</h2>
          <p>法人名、目的、市区町村を検索し、20の活動分野を必要なだけ重ねます。</p>
        </section>
        <section>
          <b>三</b>
          <h2>公式記録で確かめる</h2>
          <p>気になる箱へ残して比較し、内閣府の法人ページで最新情報と閲覧書類を確認します。</p>
        </section>
      </div>
      <aside class="care-note">
        <strong>掲載情報の位置づけ</strong>
        <p>
          行政入力CSVを見つけやすく加工したものです。活動中であること、所在地、募集、寄附受付を保証しません。連絡や判断の前に公式記録と法人自身の案内を確認してください。
        </p>
      </aside>
      <a class="page-cta" href="/">
        地域を選ぶ
      </a>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/source`}
    description="まちのNPOが利用する内閣府NPO法人行政入力情報、収録範囲、除外項目、加工の説明。"
    title="出典とデータ | まちのNPO"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">典</span>
        <div>
          <p>出典とデータ</p>
          <h1>公式記録を、地域のカード箱へ</h1>
        </div>
      </header>
      <div class="source-grid">
        <section>
          <h2>出典</h2>
          <p>
            内閣府「
            <a
              href="https://www.npo-homepage.go.jp/npoportal/download/all"
              rel="noopener noreferrer"
            >
              NPO法人情報の一括ダウンロード
            </a>
            」の全所轄庁・行政入力情報を使用します。データ表示日は2026年7月31日です。
          </p>
        </section>
        <section>
          <h2>収録範囲</h2>
          <p>
            60,162行から解散情報が空欄の49,062行を収録します。空欄は現在の活動を保証するものではありません。目的記載48,919件、所在地記載49,005件です。
          </p>
        </section>
        <section>
          <h2>表示の加工</h2>
          <p>
            所轄庁を47都道府県へまとめ、法人名、法人名カナ、市区町村、目的、20活動分野、設立認証日、法人番号、公式記録IDを抽出します。代表者名、郵便番号、番地、従たる事務所は収録しません。
          </p>
        </section>
        <section>
          <h2>利用条件</h2>
          <p>
            <a href="https://www.cao.go.jp/notice/rule.html" rel="noopener noreferrer">
              内閣府ホームページ利用規約
            </a>
            と公共データ利用規約第1.0版に従い、出典と加工を表示します。内閣府が作成した画面ではありません。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="まちのNPOの地域データ、検索、気になる箱、匿名利用計測の保存範囲。"
    title="保存とプライバシー | まちのNPO"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">守</span>
        <div>
          <p>保存</p>
          <h1>検索と気になる箱は端末内</h1>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>地域データ</h2>
          <p>
            選んだ都道府県の公開法人データだけをブラウザへ読み込み、検索語と活動分野を端末内で照合します。
          </p>
        </section>
        <section>
          <h2>気になる箱</h2>
          <p>
            選んだ最大12法人の公開情報は、このブラウザのlocalStorageだけに保存します。検索語や法人選択をサーバーへ送りません。
          </p>
        </section>
        <section>
          <h2>利用計測</h2>
          <p>
            ランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保持します。都道府県、検索語、活動分野、法人IDの列はありません。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", requestId());
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});

app.get("/", (c) => {
  c.header("Cache-Control", "public,max-age=60,s-maxage=300");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ApiError("invalid_request", 400);
  const name =
    typeof (payload as Record<string, unknown>).name === "string"
      ? (payload as Record<string, string>).name
      : "";
  if (!telemetryNames.has(name)) throw new ApiError("invalid_event", 400);
  await recordEvent(c, name);
  return c.body(null, 202);
});

app.get("/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    activities: 20,
    organizations: 49062,
    ok: database?.ok === 1,
    prefectures: 47,
    service: "machi-npo",
  });
});

app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${canonicalOrigin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=3600,s-maxage=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${canonicalOrigin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | まちのNPO"
    >
      <main class="not-found" id="main">
        <span>404</span>
        <h1>このカード箱はありません</h1>
        <p>都道府県を選ぶ画面へ戻ってください。</p>
        <a href="/">地域を選ぶ</a>
      </main>
    </Layout>,
  );
});

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  console.error(
    "request_failed",
    c.get("requestId"),
    error instanceof Error ? error.message : "unknown",
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export { app };
export default { fetch: app.fetch, scheduled };
