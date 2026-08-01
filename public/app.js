(() => {
  "use strict";

  const sessionKey = "machi-npo-session-v1";
  const seenKey = "machi-npo-seen-v1";
  const shortlistKey = "machi-npo-shortlist-v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const isQa =
    new URLSearchParams(location.search).get("qa") === "1" ||
    location.hostname === "localhost" ||
    navigator.webdriver === true;

  const readLocal = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeLocal = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const readJson = (key, fallback) => {
    try {
      return JSON.parse(readLocal(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };

  const oldSession = readLocal(sessionKey) ?? "";
  const session = uuidPattern.test(oldSession) ? oldSession : crypto.randomUUID();
  writeLocal(sessionKey, session);
  const emit = (name) => {
    fetch("/api/telemetry", {
      body: JSON.stringify({ name }),
      headers: {
        "Content-Type": "application/json",
        "X-Machi-NPO-QA": isQa ? "1" : "0",
        "X-Machi-NPO-Session": session,
      },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  };

  const previousVisit = Number(readLocal(seenKey) ?? 0);
  emit("visited");
  if (previousVisit && Date.now() - previousVisit > 8 * 60 * 60 * 1000) emit("returned");
  writeLocal(seenKey, String(Date.now()));

  const searchInput = document.querySelector("#organization-search");
  if (!(searchInput instanceof HTMLInputElement)) return;

  const workspace = document.querySelector("#directory-workspace");
  const prefectureName = document.querySelector("#prefecture-name");
  const prefectureBadge = document.querySelector("#prefecture-badge");
  const prefectureCount = document.querySelector("#prefecture-count");
  const searchStatus = document.querySelector("#search-status");
  const activityButtons = document.querySelector("#activity-buttons");
  const resetFilters = document.querySelector("#reset-filters");
  const organizationGrid = document.querySelector("#organization-grid");
  const resultCount = document.querySelector("#result-count");
  const loadMore = document.querySelector("#load-more");
  const changePrefecture = document.querySelector("#change-prefecture");
  const shortlistItems = document.querySelector("#shortlist-items");
  const shortlistCount = document.querySelector("#shortlist-count");
  const copyShortlist = document.querySelector("#copy-shortlist");
  const clearShortlist = document.querySelector("#clear-shortlist");

  let indexData = null;
  let currentPrefecture = null;
  let organizations = [];
  let selectedActivities = new Set();
  let shortlist = readJson(shortlistKey, []);
  let visibleLimit = 50;
  let searchTimer = 0;
  let searchEmitted = false;
  let filterEmitted = false;

  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replaceAll(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60))
      .replaceAll(/[\s/・［］＜＞（）()、，,.-]+/gu, " ")
      .trim();
  const text = (tag, value, className = "") => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const button = (label, className, action) => {
    const element = text("button", label, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const announce = (message) => {
    if (searchStatus) searchStatus.textContent = message;
  };
  const officialUrl = (id) => `https://www.npo-homepage.go.jp/npoportal/detail/${id}`;
  const activityNames = (mask) =>
    indexData.activities.filter((_activity, index) => (mask & (1 << index)) !== 0);

  shortlist = (Array.isArray(shortlist) ? shortlist : [])
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.l === "string" &&
        typeof item.n === "string" &&
        typeof item.prefecture === "string",
    )
    .slice(0, 12);

  const persistShortlist = () => writeLocal(shortlistKey, JSON.stringify(shortlist.slice(0, 12)));
  const isSaved = (id) => shortlist.some((item) => item.id === id);

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  const renderShortlist = () => {
    if (!shortlistItems || !shortlistCount) return;
    shortlistItems.replaceChildren();
    shortlistCount.textContent = `${shortlist.length} / 12`;
    if (!shortlist.length) {
      shortlistItems.append(text("p", "法人カードの「気になる」を押すと、端末内の箱へ残せます。"));
    } else {
      shortlist.forEach((item, index) => {
        const card = document.createElement("article");
        card.append(
          text("span", String(index + 1).padStart(2, "0")),
          text("strong", item.n),
          text("small", `${item.prefecture}・${item.l}`),
        );
        const actions = document.createElement("div");
        const source = document.createElement("a");
        source.href = officialUrl(item.id);
        source.rel = "noopener noreferrer";
        source.textContent = "公式記録";
        source.addEventListener("click", () => emit("official_opened"));
        actions.append(
          source,
          button("外す", "remove-saved", () => {
            shortlist = shortlist.filter((candidate) => candidate.id !== item.id);
            persistShortlist();
            renderShortlist();
            updateSaveButtons();
          }),
        );
        card.append(actions);
        shortlistItems.append(card);
      });
    }
    [copyShortlist, clearShortlist].forEach((control) => {
      if (control) control.disabled = shortlist.length === 0;
    });
  };

  const updateSaveButtons = () => {
    document.querySelectorAll("[data-save-organization]").forEach((control) => {
      if (!(control instanceof HTMLButtonElement)) return;
      const saved = isSaved(control.dataset.saveOrganization);
      control.textContent = saved ? "気になる箱にあります" : "気になる";
      control.disabled = saved;
    });
  };

  const saveOrganization = (organization) => {
    if (isSaved(organization.id)) return;
    if (shortlist.length >= 12) {
      announce("気になる箱は12法人までです。どれかを外してから追加してください");
      return;
    }
    shortlist.push({
      id: organization.id,
      l: organization.l,
      n: organization.n,
      prefecture: currentPrefecture.name,
    });
    persistShortlist();
    renderShortlist();
    updateSaveButtons();
    announce(`${organization.n}を気になる箱へ残しました`);
    emit("saved");
  };

  const organizationCard = (organization) => {
    const card = document.createElement("article");
    card.className = "organization-card";
    const top = document.createElement("header");
    top.append(text("span", organization.l), text("small", `認証 ${organization.d || "記載なし"}`));
    const heading = text("h3", organization.n);
    const fields = document.createElement("div");
    fields.className = "field-tags";
    const names = activityNames(organization.a);
    names.slice(0, 4).forEach((name) => fields.append(text("span", name)));
    if (names.length > 4) fields.append(text("small", `ほか${names.length - 4}分野`));
    const purpose = text(
      "p",
      organization.p || "定款に記載された目的はデータにありません。",
      "organization-purpose",
    );
    const facts = document.createElement("dl");
    facts.append(
      text("dt", "法人番号"),
      text("dd", organization.c || "記載なし"),
      text("dt", "公式ID"),
      text("dd", organization.id),
    );
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const source = document.createElement("a");
    source.href = officialUrl(organization.id);
    source.rel = "noopener noreferrer";
    source.textContent = "公式記録を見る ↗";
    source.addEventListener("click", () => emit("official_opened"));
    const save = button("気になる", "save-organization", () => saveOrganization(organization));
    save.dataset.saveOrganization = organization.id;
    actions.append(save, source);
    card.append(top, heading, fields, purpose, facts, actions);
    return card;
  };

  const matchingOrganizations = () => {
    const query = normalize(searchInput.value);
    const terms = query.split(" ").filter(Boolean);
    let activityMask = 0;
    selectedActivities.forEach((index) => {
      activityMask |= 1 << index;
    });
    return organizations.filter(
      (organization) =>
        terms.every((term) => organization.search.includes(term)) &&
        (organization.a & activityMask) === activityMask,
    );
  };

  const renderResults = () => {
    if (!organizationGrid || !resultCount || !currentPrefecture) return;
    const matches = matchingOrganizations();
    const visible = matches.slice(0, visibleLimit);
    organizationGrid.replaceChildren();
    resultCount.textContent = `${matches.length.toLocaleString("ja-JP")}件`;
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-results";
      empty.append(
        text("span", "町"),
        text("h3", "一致する法人がありません"),
        text("p", "短いことばにするか、活動分野を一つ外してお試しください。"),
      );
      organizationGrid.append(empty);
    } else {
      visible.forEach((organization) => organizationGrid.append(organizationCard(organization)));
    }
    if (loadMore) {
      loadMore.hidden = visible.length >= matches.length;
      loadMore.textContent = `次の${Math.min(50, matches.length - visible.length)}件を見る`;
    }
    updateSaveButtons();
    announce(
      `${currentPrefecture.name}の${matches.length.toLocaleString("ja-JP")}法人に絞りました`,
    );
  };

  const renderActivityButtons = () => {
    if (!activityButtons || !indexData) return;
    activityButtons.replaceChildren();
    indexData.activities.forEach((activity, index) => {
      const control = button(activity, "", () => {
        if (selectedActivities.has(index)) selectedActivities.delete(index);
        else selectedActivities.add(index);
        visibleLimit = 50;
        renderActivityButtons();
        renderResults();
        if (!filterEmitted) {
          filterEmitted = true;
          emit("filtered");
        }
      });
      control.setAttribute("aria-pressed", String(selectedActivities.has(index)));
      activityButtons.append(control);
    });
  };

  const openPrefecture = async (code) => {
    const prefecture = indexData?.prefectures.find((item) => item.id === code);
    if (!prefecture) return;
    document.querySelectorAll("[data-prefecture]").forEach((control) => {
      control.setAttribute(
        "aria-pressed",
        String(control.getAttribute("data-prefecture") === code),
      );
    });
    announce(`${prefecture.name}のデータを開いています…`);
    if (workspace instanceof HTMLElement) workspace.hidden = false;
    if (organizationGrid)
      organizationGrid.replaceChildren(text("p", "地域のカード箱を開いています…", "loading-note"));
    try {
      const response = await fetch(`/data/${code}.json`, { cache: "force-cache" });
      if (!response.ok) throw new Error("prefecture_data_failed");
      const payload = await response.json();
      if (
        !Array.isArray(payload.organizations) ||
        payload.organizations.length !== prefecture.count
      )
        throw new Error("prefecture_data_invalid");
      currentPrefecture = prefecture;
      organizations = payload.organizations.map((organization) => ({
        ...organization,
        search: normalize(
          `${organization.n} ${organization.k} ${organization.l} ${organization.p}`,
        ),
      }));
      selectedActivities = new Set();
      searchInput.value = "";
      visibleLimit = 50;
      if (prefectureBadge) prefectureBadge.textContent = code;
      if (prefectureName) prefectureName.textContent = prefecture.name;
      if (prefectureCount)
        prefectureCount.textContent = `${prefecture.count.toLocaleString("ja-JP")}法人`;
      renderActivityButtons();
      renderResults();
      workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
      emit("prefecture_selected");
    } catch {
      announce("地域データを読み込めませんでした。もう一度お試しください");
      if (organizationGrid)
        organizationGrid.replaceChildren(
          text("p", "地域データを読み込めませんでした。", "loading-note"),
        );
    }
  };

  const scheduleSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      visibleLimit = 50;
      renderResults();
      if (!searchEmitted && normalize(searchInput.value).length >= 2) {
        searchEmitted = true;
        emit("searched");
      }
    }, 120);
  };

  copyShortlist?.addEventListener("click", async () => {
    const lines = [
      "気になるNPO法人",
      ...shortlist.flatMap((item, index) => [
        `${index + 1}. ${item.n}`,
        `   ${item.prefecture}・${item.l}`,
        `   ${officialUrl(item.id)}`,
      ]),
      "",
      "出典：内閣府 NPO法人ポータルサイト 行政入力情報を加工",
      "https://machi-npo.yhay81.com",
    ];
    await copyText(lines.join("\n"));
    announce("気になる法人の一覧をコピーしました");
    emit("shortlist_copied");
  });
  clearShortlist?.addEventListener("click", () => {
    shortlist = [];
    persistShortlist();
    renderShortlist();
    updateSaveButtons();
    announce("気になる箱を空にしました");
  });
  resetFilters?.addEventListener("click", () => {
    selectedActivities = new Set();
    searchInput.value = "";
    visibleLimit = 50;
    renderActivityButtons();
    renderResults();
  });
  loadMore?.addEventListener("click", () => {
    visibleLimit += 50;
    renderResults();
  });
  changePrefecture?.addEventListener("click", () => {
    document.querySelector("#prefecture-heading")?.scrollIntoView({ behavior: "smooth" });
  });
  searchInput.addEventListener("input", scheduleSearch);

  const loadIndex = async () => {
    try {
      const response = await fetch("/data/index.json", { cache: "force-cache" });
      if (!response.ok) throw new Error("index_failed");
      indexData = await response.json();
      if (
        indexData.source.activeRows !== 49062 ||
        indexData.prefectures.length !== 47 ||
        indexData.activities.length !== 20
      )
        throw new Error("index_invalid");
      indexData.prefectures.forEach((prefecture) => {
        const count = document.querySelector(`[data-prefecture-count="${prefecture.id}"]`);
        if (count) count.textContent = prefecture.count.toLocaleString("ja-JP");
      });
      document.querySelectorAll("[data-prefecture]").forEach((control) => {
        control.addEventListener("click", () =>
          openPrefecture(control.getAttribute("data-prefecture")),
        );
      });
      renderActivityButtons();
    } catch {
      const directoryTotal = document.querySelector("#directory-total");
      if (directoryTotal) directoryTotal.textContent = "データを読み込めませんでした";
    }
  };

  renderShortlist();
  void loadIndex();
})();
