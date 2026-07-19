const FAV_KEY = "launcher_favorites_v1";
const HIST_KEY = "launcher_history_v1";

let state = {
  servers: [],
  selected: null,
  admin: true,
  activePage: "play",
  favorites: [],
  history: [],
  updated: "",
  /** @type {Record<string, number>} */
  pingByKey: {},
};

const $ = (s) => document.querySelector(s);
const serverList = $("#serverList");
const searchInput = $("#search");
const statusText = $("#statusText");
const statusDot = $("#statusDot");
const heroBanner = $("#heroBanner");
const btnConnect = $("#btnSidebarConnect");
const playToast = $("#playToast");
const serverLoadingEl = $("#serverLoading");
const ctxMenu = $("#ctxMenu");
let serversLoading = true;
let serversLoadingSince = Date.now();
let serversLoadingHideTimer = null;
let initialStateReceived = false;

(function showBootLoading() {
  const app = document.querySelector(".app");
  app?.classList.add("is-loading");
  if (serverLoadingEl) {
    serverLoadingEl.hidden = false;
    serverLoadingEl.setAttribute("aria-busy", "true");
  }
})();
let lastConnectKey = "";
let lastConnectAt = 0;
let ctxTarget = null;
let ctxDismissBlockUntil = 0;
let ctxOpenGuard = 0;

const INTERACTIVE =
  "button, input, textarea, select, a, .tab, .row, .table-body, .table-head, .th-search, .sub-panel, .topbar-right, .status-right";

function post(msg) {
  if (window.chrome && chrome.webview) chrome.webview.postMessage(msg);
}

function setServersLoading(on) {
  const app = document.querySelector(".app");
  if (!serverLoadingEl) return;
  if (serversLoadingHideTimer) {
    clearTimeout(serversLoadingHideTimer);
    serversLoadingHideTimer = null;
  }
  if (on) {
    serversLoading = true;
    serversLoadingSince = Date.now();
    app?.classList.add("is-loading");
    serverLoadingEl.hidden = false;
    serverLoadingEl.setAttribute("aria-busy", "true");
    return;
  }
  const elapsed = Date.now() - serversLoadingSince;
  const delay = Math.max(0, 180 - elapsed);
  serversLoadingHideTimer = setTimeout(() => {
    serversLoadingHideTimer = null;
    serversLoading = false;
    app?.classList.remove("is-loading");
    serverLoadingEl.hidden = true;
    serverLoadingEl.setAttribute("aria-busy", "false");
  }, delay);
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.className = isError ? "err" : "ok";
  statusDot.parentElement.className = "status-left " + (isError ? "err" : "ok");

  if (!playToast) return;
  playToast.textContent = text;
  playToast.hidden = false;
  playToast.className = "play-toast" + (isError ? " err" : " ok");
  clearTimeout(setStatus._toastTimer);
  setStatus._toastTimer = setTimeout(() => {
    playToast.hidden = true;
  }, isError ? 5000 : 2500);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n) {
  return n.toLocaleString("fr-FR").replace(/\u202f/g, " ").replace(/,/g, " ");
}

function sortByName(servers) {
  return [...servers].sort((a, b) => a.name.localeCompare(b.name, "sr"));
}

function initDirectModal() {
  const modal = $("#directModal");
  const btn = $("#btnDirect");
  const form = $("#directForm");
  const hostInput = $("#directHost");
  if (!modal || !btn || !form) return;

  const open = () => {
    modal.hidden = false;
    btn.classList.add("active");
    setTimeout(() => hostInput?.focus(), 0);
  };

  const close = () => {
    modal.hidden = true;
    btn.classList.remove("active");
  };

  btn.addEventListener("click", () => {
    if (modal.hidden) open();
    else close();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector(".direct-modal")?.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const host = hostInput.value.trim() || "127.0.0.1";
    const port = $("#directPort").value.trim() || "22005";
    addHistory({ host, port, name: `${host}:${port}`, gamemode: "", lang: "" });
    post({ type: "connect", host, port });
    close();
  });
}

function initWindowDrag() {
  const dragZone = document.querySelector(".topbar-drag");
  if (!dragZone) return;

  dragZone.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    post({ type: "dragStart" });
    e.preventDefault();
  });
}

function serverKey(s) {
  const host = String(s?.host ?? "").toLowerCase().trim();
  const port = String(s?.port ?? "").trim();
  return `${host}:${port}`;
}

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function collectPingTargets() {
  const seen = new Set();
  const targets = [];

  const add = (s) => {
    if (!s?.host) return;
    const key = serverKey(s);
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ host: s.host, port: String(s.port || "22005") });
  };

  for (const s of state.history) add(s);
  for (const s of state.favorites) add(s);
  return targets;
}

function syncPingTargets() {
  post({ type: "setPingTargets", targets: collectPingTargets() });
}

function saveFavorites(list) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
  state.favorites = list;
  syncPingTargets();
}

function saveHistory(list) {
  const trimmed = list.slice(0, 100);
  localStorage.setItem(HIST_KEY, JSON.stringify(trimmed));
  state.history = trimmed;
  syncPingTargets();
}

function snapshotServer(s) {
  const meta = parseServerMeta(s);
  return {
    host: s.host,
    port: s.port,
    name: s.name || "",
    gamemode: s.gamemode || "",
    lang: s.lang || "",
    ping: typeof s.ping === "number" ? s.ping : -1,
    pingReady: !!s.pingReady,
    hasPassword: meta.hasPassword,
    hasVoice: meta.hasVoice,
    hasText: meta.hasText,
  };
}

function mergeWithLive(stored) {
  const live = state.servers.find((x) => serverKey(x) === serverKey(stored));
  if (!live) {
    const key = serverKey(stored);
    const cached = state.pingByKey[key];
    const out = { ...stored };
    if (typeof cached === "number") {
      out.ping = cached;
      out.pingReady = true;
    }
    return out;
  }
  const meta = parseServerMeta(live);
  return {
    ...stored,
    ...live,
    ping: live.ping,
    pingReady: live.pingReady,
    hasPassword: meta.hasPassword,
    hasVoice: meta.hasVoice,
    hasText: meta.hasText,
  };
}

function isFavorite(key) {
  return state.favorites.some((f) => serverKey(f) === key);
}

function addFavorite(s) {
  const key = serverKey(s);
  const next = state.favorites.filter((f) => serverKey(f) !== key);
  next.push(snapshotServer(s));
  saveFavorites(next);
}

function removeFavorite(key) {
  saveFavorites(state.favorites.filter((f) => serverKey(f) !== key));
}

function newHistoryId() {
  return `h${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureHistoryIds(list) {
  let changed = false;
  const next = list.map((entry) => {
    if (entry.hid) return entry;
    changed = true;
    return { ...entry, hid: newHistoryId() };
  });
  if (changed) saveHistory(next);
  return next;
}

function addHistory(s) {
  const snap = snapshotServer(s);
  const key = serverKey(snap);
  const next = state.history.filter((h) => serverKey(h) !== key);
  next.unshift({ ...snap, at: Date.now(), hid: newHistoryId() });
  saveHistory(next);
}

function removeFromHistoryById(hid) {
  if (!hid) return;
  saveHistory(state.history.filter((h) => h.hid !== hid));
}

function connectServer(s) {
  if (!s?.host) return;
  const key = serverKey(s);
  const now = Date.now();
  if (key === lastConnectKey && now - lastConnectAt < 1500) return;
  lastConnectKey = key;
  lastConnectAt = now;

  state.selected = key;
  addHistory(s);
  updateConnectBtn();
  post({ type: "select", host: s.host, port: String(s.port) });
  post({ type: "connect", host: s.host, port: String(s.port) });
}

function serverByKey(key) {
  if (!key) return null;
  const norm = String(key).toLowerCase();
  const visible = sortListForPage(listForActivePage()).find((s) => serverKey(s) === norm);
  if (visible) return visible;
  return (
    state.servers.find((s) => serverKey(s) === norm) ||
    state.favorites.find((s) => serverKey(s) === norm) ||
    state.history.find((s) => serverKey(s) === norm) ||
    null
  );
}

function openRowContextMenu(e) {
  const row = e.target.closest(".row");
  if (!row) return;

  let s = null;
  const hid = row.dataset.hid || "";
  if (state.activePage === "history" && hid) {
    const stored = state.history.find((h) => h.hid === hid);
    if (stored) s = mergeWithLive(stored);
  }
  if (!s) s = serverByKey(row.dataset.key);
  if (!s) return;

  e.preventDefault();
  e.stopPropagation();

  const now = Date.now();
  if (now - ctxOpenGuard < 80) return;
  ctxOpenGuard = now;
  ctxDismissBlockUntil = now + 400;

  showContextMenu(e.clientX, e.clientY, s, hid);
}

function hideContextMenu() {
  if (!ctxMenu) return;
  ctxMenu.hidden = true;
  ctxTarget = null;
}

function showContextMenu(x, y, s, historyId = "") {
  if (!ctxMenu) return;
  ctxTarget = s;
  const key = serverKey(s);
  const fav = isFavorite(key);
  const page = state.activePage;

  const items = [{ label: "Connect", run: () => connectServer(s) }];
  if (fav) {
    items.push({
      label: "Remove from favourites",
      run: () => {
        removeFavorite(key);
        renderServers();
      },
    });
  } else {
    items.push({
      label: "Add to favourites",
      run: () => {
        addFavorite(s);
        renderServers();
      },
    });
  }
  if (page === "history" && historyId) {
    items.push({
      label: "Remove from history",
      run: () => {
        removeFromHistoryById(historyId);
        renderServers();
      },
    });
  }

  ctxMenu.innerHTML = "";
  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      ctxMenu.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctx-item" + (item.danger ? " danger" : "");
    btn.textContent = item.label;
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideContextMenu();
      item.run();
    });
    ctxMenu.appendChild(btn);
  }

  ctxMenu.hidden = false;
  const pad = 4;
  const rect = ctxMenu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  ctxMenu.style.left = `${Math.max(pad, left)}px`;
  ctxMenu.style.top = `${Math.max(pad, top)}px`;
}

function initContextMenu() {
  if (serverList) {
    serverList.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".row")) return;
      openRowContextMenu(e);
    });
    serverList.addEventListener("mousedown", (e) => {
      if (e.button !== 2) return;
      if (!e.target.closest(".row")) return;
      openRowContextMenu(e);
    });
  }

  document.addEventListener("click", (e) => {
    if (Date.now() < ctxDismissBlockUntil) return;
    if (ctxMenu && ctxMenu.contains(e.target)) return;
    hideContextMenu();
  });

  document.addEventListener("contextmenu", (e) => {
    if (!ctxMenu || ctxMenu.hidden) return;
    if (ctxMenu.contains(e.target)) return;
    hideContextMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });
  window.addEventListener("blur", hideContextMenu);
}

function listForActivePage() {
  const q = searchInput.value.trim().toLowerCase();
  let list;
  if (state.activePage === "favourites") {
    list = state.favorites.map(mergeWithLive);
  } else if (state.activePage === "history") {
    list = state.history.map(mergeWithLive);
  } else {
    list = state.servers;
  }
  return list.filter((s) => {
    const hay = `${s.name} ${s.host} ${s.gamemode || ""}`.toLowerCase();
    return !q || hay.includes(q);
  });
}

function historyEntriesForView() {
  const q = searchInput.value.trim().toLowerCase();
  return state.history
    .map((stored) => ({ hid: stored.hid, server: mergeWithLive(stored) }))
    .filter(({ server }) => {
      const hay = `${server.name} ${server.host} ${server.gamemode || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });
}

function sortListForPage(list) {
  if (state.activePage === "history") {
    const order = new Map(state.history.map((h, i) => [serverKey(h), i]));
    return [...list].sort((a, b) => (order.get(serverKey(a)) ?? 999) - (order.get(serverKey(b)) ?? 999));
  }
  return sortByName(list);
}

const TLD_COUNTRY = {
  rs: "RS", ru: "RU", de: "DE", fr: "FR", es: "ES", ro: "RO", pl: "PL", us: "US",
  uk: "GB", hr: "HR", ba: "BA", me: "ME", si: "SI", mk: "MK", it: "IT", nl: "NL",
  be: "BE", at: "AT", ch: "CH", cz: "CZ", sk: "SK", hu: "HU", bg: "BG", ua: "UA",
  tr: "TR", br: "BR", ar: "AR", mx: "MX", ca: "CA", au: "AU", jp: "JP", kr: "KR",
  cn: "CN", in: "IN", pt: "PT", gr: "GR", se: "SE", no: "NO", dk: "DK", fi: "FI",
  ie: "IE", lt: "LT", lv: "LV", ee: "EE", al: "AL", ge: "GE", az: "AZ", kz: "KZ",
  by: "BY", md: "MD", lu: "LU", is: "IS", cy: "CY", mt: "MT", vn: "VN",
};

const COUNTRY_NAMES = {
  RS: "Serbia", RU: "Russia", DE: "Germany", FR: "France", ES: "Spain",
  RO: "Romania", PL: "Poland", US: "USA", GB: "UK", HR: "Croatia", BA: "Bosnia",
  ME: "Montenegro", SI: "Slovenia", MK: "North Macedonia", IT: "Italy", NL: "Netherlands",
  BE: "Belgium", AT: "Austria", CH: "Switzerland", CZ: "Czechia", SK: "Slovakia",
  HU: "Hungary", BG: "Bulgaria", UA: "Ukraine", TR: "Turkey", BR: "Brazil",
  AR: "Argentina", MX: "Mexico", CA: "Canada", AU: "Australia", JP: "Japan",
  KR: "Korea", CN: "China", IN: "India", PT: "Portugal", GR: "Greece",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", IE: "Ireland",
  LT: "Lithuania", LV: "Latvia", EE: "Estonia", AL: "Albania", VN: "Vietnam",
  ID: "Indonesia", GE: "Georgia", MD: "Moldova",
  EU: "Europe", NA: "North America", AS: "Asia", UN: "Unknown",
};

const FLAG_FILE = {
  UK: "gb",
  GB: "gb",
  EU: "eu",
  UN: "un",
  NA: "us",
  AS: "cn",
  GEO: "ge",
};

const LANG_COUNTRY = {
  gb: "GB",
  us: "US",
  ru: "RU",
  de: "DE",
  fr: "FR",
  es: "ES",
  ro: "RO",
  pl: "PL",
  hr: "HR",
  ba: "BA",
  me: "ME",
  si: "SI",
  mk: "MK",
  it: "IT",
  nl: "NL",
  be: "BE",
  at: "AT",
  ch: "CH",
  cz: "CZ",
  sk: "SK",
  hu: "HU",
  bg: "BG",
  ua: "UA",
  tr: "TR",
  br: "BR",
  ar: "AR",
  mx: "MX",
  ca: "CA",
  au: "AU",
  jp: "JP",
  kr: "KR",
  cn: "CN",
  in: "IN",
  pt: "PT",
  gr: "GR",
  se: "SE",
  no: "NO",
  dk: "DK",
  fi: "FI",
  ie: "IE",
  lt: "LT",
  lv: "LV",
  ee: "EE",
  al: "AL",
  vn: "VN",
  rs: "RS",
  geo: "GE",
  ge: "GE",
  id: "ID",
  md: "MD",
  ko: "KR",
  en: "GB",
};

function langToCountry(lang) {
  const key = String(lang || "").toLowerCase().trim();
  if (!key) return null;
  if (LANG_COUNTRY[key]) return LANG_COUNTRY[key];
  if (key.length === 2) return key.toUpperCase();
  return null;
}

function flagFileCode(code) {
  const upper = (code || "UN").toUpperCase();
  const mapped = FLAG_FILE[upper] || upper;
  const lower = String(mapped).toLowerCase();
  if (lower === "id") return "id";
  if (lower === "ge") return "ge";
  if (/^[a-z]{2}$/.test(lower)) return lower;
  return "un";
}

function countryFromHost(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  const parts = h.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const tld = parts[parts.length - 1];
  if (TLD_COUNTRY[tld]) return TLD_COUNTRY[tld];
  if (parts.length >= 3 && parts[parts.length - 2] === "co" && tld === "uk") return "GB";
  if (parts.length >= 3 && parts[parts.length - 2] === "com" && tld === "br") return "BR";
  return null;
}

function hostFlagOverride(host, name) {
  const h = String(host || "").toLowerCase();
  const n = String(name || "").toLowerCase();

  if (/gta5grand\.com$/.test(h)) {
    if (/^de\d*\./.test(h) || h.startsWith("de.")) return "DE";
    if (h.startsWith("rs.")) return "RS";
    if (h.startsWith("fr.")) return "FR";
    if (h.startsWith("es.")) return "ES";
    if (h.startsWith("it.")) return "IT";
    if (h.startsWith("jp.")) return "JP";
    if (h.startsWith("pt.")) return "PT";
    return "GB";
  }

  if (/play\.gta\.world|eclipse-rp\.net|english\.gtahub/.test(h)) return "GB";
  if (/librarp\.com/.test(h) && (/\[eu\]|\[us\]/i.test(n) || /english|\ben server/i.test(n))) return "GB";

  return null;
}

function regionFromServer(server) {
  const fromLang = langToCountry(server.lang);
  if (fromLang) return { code: fromLang };
  const override = hostFlagOverride(server.host, server.name);
  if (override) return { code: override };
  return guessRegion(server.host, server.name);
}

function guessRegion(host, name) {
  const h = String(host || "").toLowerCase();
  const t = `${host} ${name}`.toLowerCase();

  if (/english\.gtahub|^english\./.test(h)) return { code: "GB" };
  if (/gtahub\.gg|mundo\d*\.gtahub/.test(h)) return { code: "ES" };
  if (/gta5rp\.com|gta5rp/.test(h)) return { code: "RU" };

  const rules = [
    [/serbia|beograd|belgrade|srbija|\.rs\b/, "RS"],
    [/russia|moscow|moskva|\.ru\b/, "RU"],
    [/germany|berlin|deutsch|\.de\b/, "DE"],
    [/france|paris|\.fr\b/, "FR"],
    [/spain|madrid|barcelona|\.es\b/, "ES"],
    [/romania|bucuresti|bucharest|\.ro\b/, "RO"],
    [/poland|warsaw|warszawa|\.pl\b/, "PL"],
    [/croatia|zagreb|hrvatska|\.hr\b/, "HR"],
    [/bosnia|sarajevo|\.ba\b/, "BA"],
    [/montenegro|podgorica|\.me\b/, "ME"],
    [/slovenia|ljubljana|\.si\b/, "SI"],
    [/macedonia|skopje|\.mk\b/, "MK"],
    [/italy|milano|roma|\.it\b/, "IT"],
    [/netherlands|amsterdam|\.nl\b/, "NL"],
    [/belgium|brussels|\.be\b/, "BE"],
    [/austria|vienna|wien|\.at\b/, "AT"],
    [/switzerland|zurich|\.ch\b/, "CH"],
    [/czech|prague|praha|\.cz\b/, "CZ"],
    [/slovakia|bratislava|\.sk\b/, "SK"],
    [/hungary|budapest|\.hu\b/, "HU"],
    [/bulgaria|sofia|\.bg\b/, "BG"],
    [/ukraine|kyiv|kiev|\.ua\b/, "UA"],
    [/vietnam|hanoi|saigon|\.vn\b/, "VN"],
    [/turkey|istanbul|turkiye|\.tr\b/, "TR"],
    [/brazil|saopaulo|\.com\.br|\.br\b/, "BR"],
    [/argentina|buenos|\.ar\b/, "AR"],
    [/mexico|\.mx\b/, "MX"],
    [/canada|toronto|montreal|\.ca\b/, "CA"],
    [/australia|sydney|\.au\b/, "AU"],
    [/japan|tokyo|\.jp\b/, "JP"],
    [/korea|seoul|\.kr\b/, "KR"],
    [/china|shanghai|\.cn\b/, "CN"],
    [/india|mumbai|\.in\b/, "IN"],
    [/portugal|lisbon|\.pt\b/, "PT"],
    [/greece|athens|\.gr\b/, "GR"],
    [/sweden|stockholm|\.se\b/, "SE"],
    [/norway|oslo|\.no\b/, "NO"],
    [/denmark|copenhagen|\.dk\b/, "DK"],
    [/finland|helsinki|\.fi\b/, "FI"],
    [/ireland|dublin|\.ie\b/, "IE"],
    [/lithuania|vilnius|\.lt\b/, "LT"],
    [/latvia|riga|\.lv\b/, "LV"],
    [/estonia|tallinn|\.ee\b/, "EE"],
    [/albania|tirana|\.al\b/, "AL"],
    [/britain|london|england|\.uk\b|\.co\.uk/, "GB"],
    [/america|dallas|newyork|chicago|\.us\b/, "US"],
  ];

  for (const [re, code] of rules) {
    if (re.test(t)) return { code };
  }

  const fromHost = countryFromHost(host);
  if (fromHost) return { code: fromHost };

  return { code: "UNKNOWN" };
}

function renderFlag(region) {
  const code = region.code || "UNKNOWN";
  if (code === "UNKNOWN") {
    return `<span class="flag flag-unknown" title="Unknown">?</span>`;
  }
  const label = COUNTRY_NAMES[code] || code;
  const file = flagFileCode(code);
  return `<img class="flag flag-icon flag-icon-${file}" src="img/flags/${file}.png?v=36" width="26" height="18" alt="" title="${escapeHtml(label)}" loading="lazy" />`;
}

function pingInfo(ms) {
  if (ms >= 100) return { bars: 4, color: "bad" };
  if (ms >= 60) return { bars: 4, color: "warn" };
  return { bars: 4, color: "good" };
}

function renderPing(ms, ready = false) {
  if (!ready) {
    return `
      <div class="ping-wrap ping-pending" aria-label="Merenje pinga">
        <div class="ping-bars">
          <i></i><i></i><i></i><i></i>
        </div>
      </div>`;
  }
  if (ms < 0) {
    return `
      <div class="ping-wrap ping-offline">
        <span class="ping-tip">N/A</span>
        <div class="ping-bars">
          <i></i><i></i><i></i><i></i>
        </div>
      </div>`;
  }
  const { bars, color } = pingInfo(ms);
  let barHtml = "";
  for (let i = 1; i <= 4; i++) {
    barHtml += `<i class="${i <= bars ? "on" : ""}"></i>`;
  }
  return `
    <div class="ping-wrap ping-${color}">
      <span class="ping-tip">${ms} ms</span>
      <div class="ping-bars">${barHtml}</div>
    </div>`;
}

function parseServerMeta(s) {
  const raw = s.name || "";
  const tags = [];
  let hasVoice = false;
  let hasText = false;
  let hasPassword = false;
  let version = null;

  for (const m of raw.matchAll(/\[([^\]]+)\]/g)) {
    const val = m[1].trim();
    const lower = val.toLowerCase();
    if (/^\d+\.\d+$/.test(val)) version = val.replace(/\./g, "");
    else if (/^password$/i.test(val)) hasPassword = true;
    else if (/^text(e|s)?$/i.test(val)) {
      hasText = true;
      tags.push("TEXT");
    } else if (/^voice|vc$/i.test(val) || (/voice|vc/.test(lower) && !/text/.test(lower))) hasVoice = true;
    else if (/roleplay|^rp$/i.test(lower)) tags.push("ROLEPLAY");
    else if (/^[a-z]{2}$/i.test(val)) {
      const upper = val.toUpperCase();
      if (!/^(RP|VC|DM)$/.test(upper)) tags.push(upper);
    }
  }

  const blob = `${raw} ${s.gamemode || ""}`;

  if (!tags.includes("ROLEPLAY") && /roleplay|\brp\b/i.test(blob)) {
    tags.unshift("ROLEPLAY");
  }

  if (/\[(text(e|s)?|texte)\]/i.test(raw)) {
    hasText = true;
    if (!tags.includes("TEXT")) tags.push("TEXT");
  }
  if (!hasText && (/strict\s+text|\|\s*text\s*\||\btext\s+roleplay|\btext\s+rp\b/i.test(blob) || /^text\b/i.test(String(s.gamemode || "").trim()))) {
    hasText = true;
    if (!tags.includes("TEXT")) tags.push("TEXT");
  }
  if (!hasText && /\btext\b/i.test(blob) && !/\bvoice\b|\bvc\b|\[voice\]|\[vc\]/i.test(blob)) {
    hasText = true;
    if (!tags.includes("TEXT")) tags.push("TEXT");
  }

  if (hasVoice || /\[voice\]|\[vc\]/i.test(raw)) {
    hasVoice = true;
    if (!tags.includes("VOICE")) tags.push("VOICE");
  }
  if (/password/i.test(raw)) hasPassword = true;
  if (version && !tags.includes(version)) tags.push(version);

  if (tags.includes("TEXT")) hasText = true;
  hasVoice = tags.includes("VOICE") || /\[voice\]|\[vc\]/i.test(raw);

  const displayName = raw
    .replace(/\[([^\]]+)\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    displayName: displayName || raw,
    tags: sortTags([...new Set(tags)]),
    hasVoice,
    hasText,
    hasPassword,
  };
}

function sortTags(tags) {
  const rank = (t) => {
    if (t === "ROLEPLAY") return 0;
    if (/^(EU|US|RU|ES|DE|FR|GB|UK|EN|RO|PL|UA|TR|VN|ID|RS|MD|MK|GE|JP|KR|CN|BR|AR|MX|CA|AU|PT|GR|SE|NO|DK|FI|IE|LT|LV|EE|AL|HR|BA|ME|SI|SK|HU|BG|CZ|AT|CH|BE|NL|IT)$/i.test(t)) return 1;
    if (t === "VOICE") return 2;
    if (t === "TEXT") return 3;
    if (/^\d+$/.test(t)) return 4;
    return 5;
  };
  return tags.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function renderRowIcons(meta) {
  const tags = meta.tags || [];
  const voice = meta.hasVoice || tags.includes("VOICE");
  return (meta.hasPassword ? renderLock() : renderLockMuted()) + (voice ? renderMic() : renderMicMuted());
}

function renderLock() {
  return `<svg class="row-icon lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
}

function renderLockMuted() {
  return `<svg class="row-icon lock-icon lock-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
}

function renderMic() {
  return `<svg class="row-icon mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>`;
}

function renderMicMuted() {
  return `<svg class="row-icon mic-icon mic-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>`;
}

function renderTags(tags) {
  return tags
    .map((t) => `<span class="tag outline">${escapeHtml(t)}</span>`)
    .join("");
}

function updateConnectBtn() {
  btnConnect.disabled = !state.selected;
}

function applyPingToServer(s, ms) {
  if (!s) return false;
  const ready = true;
  if (s.ping === ms && s.pingReady === ready) return false;
  s.ping = ms;
  s.pingReady = ready;
  return true;
}

function applyPings(values) {
  if (!values) return;

  if (Object.keys(values).length === 0) {
    state.pingByKey = {};
    for (const s of state.servers) {
      s.ping = -1;
      s.pingReady = false;
    }
    renderServers();
    return;
  }

  for (const [key, ms] of Object.entries(values)) {
    const normKey = String(key).toLowerCase();
    const n = Number(ms);
    if (!Number.isFinite(n)) continue;
    state.pingByKey[normKey] = n;
    applyPingToServer(state.servers.find((x) => serverKey(x) === normKey), n);
  }
  renderServers();
}

function renderServerRow(s, extra = {}) {
  const key = serverKey(s);
  const region = regionFromServer(s);
  const meta = parseServerMeta(s);
  const mode = (s.gamemode || "—").split(/[,|/]/)[0].trim().toUpperCase() || "—";
  const ping = renderPing(s.ping, s.pingReady);
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.key = key;
  if (extra.hid) row.dataset.hid = extra.hid;

  row.innerHTML = `
    <div class="cell-server">
      ${renderFlag(region)}
      <span class="srv-name">${escapeHtml(truncate(meta.displayName, 64))}</span>
      <div class="srv-tags">${renderTags(meta.tags)}</div>
    </div>
    <div class="cell-icons">${renderRowIcons(meta)}</div>
    <div class="cell-mode">${escapeHtml(truncate(mode, 16))}</div>
    <div class="cell-ping">${ping}</div>`;

  row.addEventListener("click", (e) => {
    e.preventDefault();
    connectServer(s);
  });

  return row;
}

function renderServers() {
  serverList.innerHTML = "";
  updateConnectBtn();

  if (state.activePage === "history") {
    const entries = historyEntriesForView();
    if (!entries.length) return;
    entries.forEach(({ server: s, hid }) => {
      serverList.appendChild(renderServerRow(s, { hid }));
    });
    return;
  }

  const filtered = sortListForPage(listForActivePage());

  if (state.activePage === "play" && !state.servers.length) {
    serverList.innerHTML = `<div class="empty-row"><p>No servers loaded</p><span>Check your connection and click Refresh — list comes from GitHub</span></div>`;
    return;
  }

  if (state.activePage === "play" && !filtered.length) {
    serverList.innerHTML = `<div class="empty-row"><p>No results</p><span>Try a different search term</span></div>`;
    return;
  }

  if (!filtered.length) return;

  filtered.forEach((s) => {
    serverList.appendChild(renderServerRow(s));
  });
}

function applyState(data) {
  state.servers = data.servers || [];
  if (data.pings && Object.keys(data.pings).length) applyPings(data.pings);
  for (const s of state.servers) {
    const key = serverKey(s);
    const cached = state.pingByKey[key];
    if (typeof s.ping === "number") {
      s.pingReady = true;
      state.pingByKey[key] = s.ping;
    } else if (typeof cached === "number") {
      s.ping = cached;
      s.pingReady = true;
    } else {
      s.ping = -1;
      s.pingReady = false;
    }
  }
  state.admin = data.admin !== false;
  state.updated = data.updated || "";
  if (data.selected) state.selected = data.selected;

  $("#serverCount").textContent = fmtNum(state.servers.length);

  renderServers();

  if (!initialStateReceived) {
    initialStateReceived = true;
    setServersLoading(false);
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    if (page === "site") {
      post({ type: "openWebsite" });
      return;
    }

    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    state.activePage = page;
    document.getElementById("pageList").classList.add("active");
    heroBanner.classList.remove("hidden");
    document.querySelector(".app").classList.toggle("view-play", page === "play" || page === "favourites" || page === "history");
    document.querySelector(".app").classList.toggle("view-history", page === "history");
    document.querySelector(".app").classList.toggle("view-favourites", page === "favourites");
    searchInput.value = "";
    renderServers();
  });
});

searchInput.addEventListener("input", renderServers);

btnConnect.addEventListener("click", () => {
  const s =
    state.servers.find((x) => serverKey(x) === state.selected) ||
    state.favorites.map(mergeWithLive).find((x) => serverKey(x) === state.selected) ||
    state.history.map(mergeWithLive).find((x) => serverKey(x) === state.selected);
  if (s) addHistory(s);
  post({ type: "connectSelected" });
});

$("#btnDiscord").addEventListener("click", () => post({ type: "openDiscord" }));
$("#btnRefresh").addEventListener("click", () => post({ type: "refresh" }));
$("#btnMin").addEventListener("click", () => post({ type: "minimize" }));
$("#btnClose").addEventListener("click", () => post({ type: "close" }));

if (window.chrome && chrome.webview) {
  chrome.webview.addEventListener("message", (e) => {
    const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    if (data.type === "state") applyState(data);
    if (data.type === "pings") applyPings(data.values);
    if (data.type === "status") setStatus(data.message, data.error);
  });
}
