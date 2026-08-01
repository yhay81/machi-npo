import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Organization = {
  a: number;
  c: string;
  d: string;
  id: string;
  k: string;
  l: string;
  n: string;
  p: string;
};
type Shard = {
  organizations: Organization[];
  prefecture: { id: string; name: string; region: string };
};
type Index = {
  activities: string[];
  prefectures: Array<{ count: number; id: string; name: string; region: string }>;
  source: {
    activeRows: number;
    asOf: string;
    excludedDissolvedRows: number;
    locationRows: number;
    numberRows: number;
    purposeRows: number;
    totalRows: number;
    zipSha256: string;
  };
};

const dataDirectory = resolve(process.cwd(), "public/data");
const index = JSON.parse(readFileSync(resolve(dataDirectory, "index.json"), "utf8")) as Index;
const shardFiles = readdirSync(dataDirectory)
  .filter((name) => /^\d{2}\.json$/u.test(name))
  .sort();
const shards = shardFiles.map(
  (name) => JSON.parse(readFileSync(resolve(dataDirectory, name), "utf8")) as Shard,
);

describe("official NPO directory", () => {
  it("contains the verified source dimensions and hash", () => {
    expect(index.source).toMatchObject({
      activeRows: 49062,
      asOf: "2026-07-31",
      excludedDissolvedRows: 11100,
      locationRows: 49005,
      numberRows: 47590,
      purposeRows: 48919,
      totalRows: 60162,
      zipSha256: "fea270d92b6a725364e5a12256dd019b5488887a66be576a9fc4a11dfc6a9f07",
    });
    expect(index.activities).toHaveLength(20);
    expect(index.prefectures).toHaveLength(47);
    expect(index.prefectures.reduce((sum, prefecture) => sum + prefecture.count, 0)).toBe(49062);
  });

  it("splits 49,062 unique official records across exactly 47 matching shards", () => {
    expect(shardFiles).toEqual(
      Array.from(
        { length: 47 },
        (_unused, index_) => `${String(index_ + 1).padStart(2, "0")}.json`,
      ),
    );
    const organizations = shards.flatMap((shard) => shard.organizations);
    expect(organizations).toHaveLength(49062);
    expect(new Set(organizations.map((organization) => organization.id)).size).toBe(49062);
    shards.forEach((shard, index_) => {
      expect(shard.prefecture.id).toBe(index.prefectures[index_].id);
      expect(shard.organizations).toHaveLength(index.prefectures[index_].count);
    });
  });

  it("ships only the approved fields and never retains street-level locations", () => {
    const organizations = shards.flatMap((shard) => shard.organizations);
    organizations.forEach((organization) => {
      expect(Object.keys(organization).sort()).toEqual(["a", "c", "d", "id", "k", "l", "n", "p"]);
      expect(organization.id).toMatch(/^\d+$/u);
      expect(Number.isInteger(organization.a)).toBe(true);
      expect(organization.a).toBeGreaterThanOrEqual(0);
      expect(organization.a).toBeLessThan(1 << 20);
      expect(organization.l).not.toMatch(/番地|丁目|街区|\d|[０-９]|号/u);
    });
  });

  it("keeps static delivery within the regional loading budget", () => {
    const sizes = shardFiles.map((name) => statSync(resolve(dataDirectory, name)).size);
    expect(Math.max(...sizes)).toBeLessThan(6_000_000);
    expect(
      sizes.reduce((sum, size) => sum + size, statSync(resolve(dataDirectory, "index.json")).size),
    ).toBeLessThan(30_000_000);
  });
});
