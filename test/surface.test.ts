import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product surface", () => {
  const worker = read("src/worker.tsx");
  const client = read("public/app.js");
  const css = read("public/styles.css");
  const migration = read("migrations/0001_telemetry.sql");
  const source = read("SOURCE.md");
  const surface = `${worker}\n${client}`;

  it("communicates through a map, pins, regional drawers, and organization cards", () => {
    expect(worker).toContain('class="directory-scene"');
    expect(worker).toContain('class="map-board"');
    expect(worker).toContain('class="card-cabinet"');
    expect(worker).toContain('class="region-grid"');
    expect(client).toContain('card.className = "organization-card"');
    expect(client).toContain('fields.className = "field-tags"');
    expect(css.toLowerCase()).not.toContain("gradient");
    expect(css).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px/su);
  });

  it("keeps searches and organization choices out of APIs, telemetry, and URLs", () => {
    expect(worker).toContain('app.post("/api/telemetry"');
    expect(worker).not.toContain('app.post("/api/search"');
    expect(client).toContain('fetch("/data/index.json"');
    expect(client).toContain("localStorage");
    expect(client).toContain("shortlist.length >= 12");
    expect(client).toContain("shortlist.slice(0, 12)");
    expect(migration).not.toMatch(
      /prefecture_id|query|search_term|activity_id|organization_id|corporation_number|email|phone|address|advertising/iu,
    );
    expect(migration).toContain("CHECK(event_name IN");
    expect(client).not.toMatch(/history\.(?:pushState|replaceState)|location\.search\s*=/u);
  });

  it("renders public data as text and links every organization to its official record", () => {
    expect(client).not.toContain("innerHTML");
    expect(worker).not.toContain("dangerouslySetInnerHTML");
    expect(client).toContain("textContent");
    expect(client).toContain("https://www.npo-homepage.go.jp/npoportal/detail/");
    expect(client).toContain("official_opened");
  });

  it("states source scope, exclusions, terms, and limitations precisely", () => {
    expect(source).toContain("NPO法人ポータルサイト");
    expect(source).toContain("2026年7月31日");
    expect(source).toContain("60,162行");
    expect(source).toContain("解散情報が空欄の49,062行");
    expect(source).toContain("公共データ利用規約第1.0版");
    expect(source).toContain("代表者名");
    expect(worker).toContain("空欄は現在の活動を保証するものではありません");
    expect(worker).toContain("内閣府が作成した画面ではありません");
  });

  it("contains no research copy and needs no account for a local shortlist", () => {
    expect(surface).not.toMatch(
      /public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性/iu,
    );
    expect(client).toContain("navigator.webdriver === true");
    expect(client).toContain('"X-Machi-NPO-QA"');
    expect(surface).not.toMatch(/better-auth|betterAuth/iu);
  });
});
