import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const [csvPath, zipPath, outputDirectory = "public/data"] = process.argv.slice(2);
if (!csvPath || !zipPath) {
  throw new Error("Usage: node scripts/build-data.mjs <administrative.csv> <source.zip> [output]");
}

const prefectures = [
  ["01", "北海道", "北海道・東北"],
  ["02", "青森県", "北海道・東北"],
  ["03", "岩手県", "北海道・東北"],
  ["04", "宮城県", "北海道・東北"],
  ["05", "秋田県", "北海道・東北"],
  ["06", "山形県", "北海道・東北"],
  ["07", "福島県", "北海道・東北"],
  ["08", "茨城県", "関東"],
  ["09", "栃木県", "関東"],
  ["10", "群馬県", "関東"],
  ["11", "埼玉県", "関東"],
  ["12", "千葉県", "関東"],
  ["13", "東京都", "関東"],
  ["14", "神奈川県", "関東"],
  ["15", "新潟県", "甲信越・北陸"],
  ["16", "富山県", "甲信越・北陸"],
  ["17", "石川県", "甲信越・北陸"],
  ["18", "福井県", "甲信越・北陸"],
  ["19", "山梨県", "甲信越・北陸"],
  ["20", "長野県", "甲信越・北陸"],
  ["21", "岐阜県", "東海"],
  ["22", "静岡県", "東海"],
  ["23", "愛知県", "東海"],
  ["24", "三重県", "東海"],
  ["25", "滋賀県", "近畿"],
  ["26", "京都府", "近畿"],
  ["27", "大阪府", "近畿"],
  ["28", "兵庫県", "近畿"],
  ["29", "奈良県", "近畿"],
  ["30", "和歌山県", "近畿"],
  ["31", "鳥取県", "中国"],
  ["32", "島根県", "中国"],
  ["33", "岡山県", "中国"],
  ["34", "広島県", "中国"],
  ["35", "山口県", "中国"],
  ["36", "徳島県", "四国"],
  ["37", "香川県", "四国"],
  ["38", "愛媛県", "四国"],
  ["39", "高知県", "四国"],
  ["40", "福岡県", "九州・沖縄"],
  ["41", "佐賀県", "九州・沖縄"],
  ["42", "長崎県", "九州・沖縄"],
  ["43", "熊本県", "九州・沖縄"],
  ["44", "大分県", "九州・沖縄"],
  ["45", "宮崎県", "九州・沖縄"],
  ["46", "鹿児島県", "九州・沖縄"],
  ["47", "沖縄県", "九州・沖縄"],
];

const activities = [
  "保健・医療・福祉",
  "社会教育",
  "まちづくり",
  "観光",
  "農山漁村・中山間地域",
  "学術・文化・芸術・スポーツ",
  "環境の保全",
  "災害救援",
  "地域安全",
  "人権・平和",
  "国際協力",
  "男女共同参画社会",
  "子どもの健全育成",
  "情報化社会",
  "科学技術の振興",
  "経済活動の活性化",
  "職業能力・雇用機会",
  "消費者の保護",
  "連絡・助言・援助",
  "条例指定",
];

const cityParents = {
  札幌市: "北海道",
  仙台市: "宮城県",
  さいたま市: "埼玉県",
  千葉市: "千葉県",
  横浜市: "神奈川県",
  川崎市: "神奈川県",
  相模原市: "神奈川県",
  新潟市: "新潟県",
  静岡市: "静岡県",
  浜松市: "静岡県",
  名古屋市: "愛知県",
  京都市: "京都府",
  大阪市: "大阪府",
  堺市: "大阪府",
  神戸市: "兵庫県",
  岡山市: "岡山県",
  広島市: "広島県",
  北九州市: "福岡県",
  福岡市: "福岡県",
  熊本市: "熊本県",
};

const prefectureByName = new Map(prefectures.map(([id, name]) => [name, id]));
const organizations = new Map(prefectures.map(([id]) => [id, []]));
const compact = (value) =>
  String(value ?? "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const municipalityLabel = (value) => {
  const county = value.match(/^(.+?郡.+?[町村])/u)?.[1];
  const countyIndex = value.indexOf("郡");
  const firstCity = value.indexOf("市");
  const firstWard = value.indexOf("区");
  if (
    county &&
    countyIndex > 0 &&
    (firstCity < 0 || countyIndex < firstCity) &&
    (firstWard < 0 || countyIndex < firstWard)
  )
    return county;
  const suffixes = ["市", "区", "町", "村"]
    .map((suffix) => ({ index: value.indexOf(suffix), suffix }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index);
  if (suffixes.length) {
    let boundary = suffixes[0].index;
    const city = value.indexOf("市", boundary + 1);
    if (boundary <= 2 && city > boundary && city <= 6) boundary = city;
    return value.slice(0, boundary + 1);
  }
  return "";
};

const municipality = (rawLocation, prefecture, authority) => {
  const location = compact(rawLocation)
    .normalize("NFKC")
    .replace(new RegExp(`^${prefecture}`), "")
    .replace(/^(?:〒\s*)?\d{3}-?\d{4}\s*/u, "");
  if (!location)
    return authority === prefecture
      ? "所在地未記載"
      : municipalityLabel(authority) || "所在地未記載";
  return municipalityLabel(location) || municipalityLabel(authority) || "所在地を公式記録で確認";
};

const parseCsv = (text, receive) => {
  let field = "";
  let quoted = false;
  let row = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      receive(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    receive(row);
  }
};

const csvBytes = await fs.readFile(csvPath);
const csvText = new TextDecoder("shift_jis").decode(csvBytes);
const zipBytes = await fs.readFile(zipPath);
let headers;
let totalRows = 0;
let activeRows = 0;
let purposeRows = 0;
let locationRows = 0;
let numberRows = 0;
let unresolvedAuthorities = 0;

parseCsv(csvText, (row) => {
  if (!headers) {
    headers = new Map(row.map((header, index) => [header, index]));
    return;
  }
  if (row.every((value) => !value)) return;
  totalRows += 1;
  const get = (name) => row[headers.get(name)] ?? "";
  if (compact(get("解散情報"))) return;
  activeRows += 1;

  const authority = compact(get("所轄庁"));
  const prefecture = cityParents[authority] ?? authority;
  const prefectureId = prefectureByName.get(prefecture);
  if (!prefectureId) {
    unresolvedAuthorities += 1;
    return;
  }
  const officialUrl = compact(get("法人情報URL"));
  const id = officialUrl.match(/\/detail\/(\d+)/u)?.[1];
  if (!id) throw new Error(`Official detail URL is missing for active row ${totalRows}`);
  const purpose = compact(get("定款に記載された目的"));
  const location = compact(get("主たる事務所の所在地"));
  const corporationNumber = compact(get("法人番号"));
  let activityMask = 0;
  activities.forEach((_activity, index) => {
    if (compact(get(`活動分野${index + 1}`))) activityMask |= 1 << index;
  });
  purposeRows += purpose ? 1 : 0;
  locationRows += location ? 1 : 0;
  numberRows += corporationNumber ? 1 : 0;
  organizations.get(prefectureId).push({
    a: activityMask,
    c: corporationNumber,
    d: compact(get("法人設立認証年月日")),
    id,
    k: compact(get("法人名称カナ")),
    l: municipality(location, prefecture, authority),
    n: compact(get("法人名称")),
    p: purpose,
  });
});

if (unresolvedAuthorities)
  throw new Error(`${unresolvedAuthorities} rows have unknown authorities`);
if (activeRows !== 49062) throw new Error(`Expected 49,062 active rows, received ${activeRows}`);
const ids = new Set([...organizations.values()].flatMap((rows) => rows.map((row) => row.id)));
if (ids.size !== activeRows)
  throw new Error(`Expected ${activeRows} unique official IDs, received ${ids.size}`);

await fs.mkdir(outputDirectory, { recursive: true });
const prefectureIndex = [];
for (const [id, name, region] of prefectures) {
  const rows = organizations.get(id).sort((left, right) => left.n.localeCompare(right.n, "ja"));
  prefectureIndex.push({ count: rows.length, id, name, region });
  await fs.writeFile(
    path.join(outputDirectory, `${id}.json`),
    JSON.stringify({ organizations: rows, prefecture: { id, name, region } }),
    "utf8",
  );
}

const index = {
  activities,
  prefectures: prefectureIndex,
  source: {
    activeRows,
    asOf: "2026-07-31",
    csvFile: path.basename(csvPath),
    downloadPage: "https://www.npo-homepage.go.jp/npoportal/download/all",
    excludedDissolvedRows: totalRows - activeRows,
    locationRows,
    numberRows,
    purposeRows,
    title: "内閣府 NPO法人ポータルサイト 行政入力情報データ",
    totalRows,
    zipSha256: crypto.createHash("sha256").update(zipBytes).digest("hex"),
    zipUrl: "https://www.npo-homepage.go.jp/npoportal/download/zip/gyousei_000.zip",
  },
};
await fs.writeFile(path.join(outputDirectory, "index.json"), JSON.stringify(index), "utf8");
process.stdout.write(
  `${JSON.stringify({ activities: activities.length, ...index.source, prefectures: prefectures.length })}\n`,
);
