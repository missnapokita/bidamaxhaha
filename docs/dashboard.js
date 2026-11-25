"use strict";

const get = id => document.getElementById(id);
const form = get("connect");
const input = get("admin-key");
const connectButton = get("connect-button");
const dashboard = get("dashboard");
const actions = get("actions");
const disconnect = get("disconnect");
const refresh = get("refresh");
const status = get("status");
const statusLabel = get("status-label");
const previous = get("previous");
const next = get("next");
const number = new Intl.NumberFormat();
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const refreshPeriod = 15_000;
let key = "";
let timer;
let pending;
let endpoint;
let page = 1;
let pages = 1;

try {
  const base = new URL(window.BIDAMAX_PRESENCE_URL);
  if (base.protocol === "https:" && !base.username && !base.password && base.pathname === "/" && !base.search && !base.hash) {
    endpoint = new URL("/v1/admin/live", base);
  }
} catch { }

function error(message) {
  get("connect-error").textContent = message;
  get("connect-error").hidden = !message;
}

function connection(label, live) {
  statusLabel.textContent = label;
  status.dataset.live = live;
}

function reset(message = "") {
  clearTimeout(timer);
  if (pending) pending.abort();
  pending = undefined;
  key = "";
  page = pages = 1;
  input.value = "";
  connectButton.disabled = false;
  refresh.disabled = false;
  form.hidden = false;
  dashboard.hidden = actions.hidden = disconnect.hidden = true;
  get("devices-body").replaceChildren();
  error(message);
  if (endpoint) input.focus();
}

function render(data) {
  get("online").textContent = number.format(data.online);
  get("watching").textContent = number.format(data.watching);
  get("browsing").textContent = number.format(data.browsing);
  get("devices-table").hidden = !data.devices.length;
  get("empty").hidden = !!data.devices.length;
  get("pagination").hidden = pages === 1;
  previous.disabled = page <= 1;
  next.disabled = page >= pages;
  const start = (page - 1) * data.page_size;
  get("showing").textContent = pages > 1
    ? number.format(start + 1) + "–" + number.format(start + data.devices.length) + " of " + number.format(data.online)
    : number.format(data.online) + " active";
  get("updated").textContent = "Updated " + time.format(data.refreshed_at * 1000);
  const rows = document.createDocumentFragment();
  for (const device of data.devices) {
    const row = document.createElement("tr");
    row.insertCell().textContent = device.device;
    const watching = device.state === "watching";
    const badge = document.createElement("span");
    badge.className = watching ? "activity watching" : "activity";
    const dot = document.createElement("span");
    dot.className = "dot";
    badge.append(dot, watching ? "Watching" : "Browsing");
    row.insertCell().append(badge);
    row.insertCell().textContent = time.format(device.last_seen * 1000);
    rows.append(row);
  }
  get("devices-body").replaceChildren(rows);
}

async function load() {
  clearTimeout(timer);
  if (!key || pending || document.hidden) return;
  const request = new AbortController();
  pending = request;
  const timeout = setTimeout(() => request.abort(), 10_000);
  refresh.disabled = true;
  previous.disabled = next.disabled = true;
  try {
    const url = new URL(endpoint);
    url.searchParams.set("page", page);
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
      cache: "no-store",
      redirect: "error",
      signal: request.signal
    });
    if (pending !== request) return;
    if (response.status === 401) {
      reset("Check your admin key and try again.");
      return;
    }
    if (!response.ok) throw new Error("Presence unavailable");
    const data = await response.json();
    if (pending !== request) return;
    pages = Math.max(1, Math.ceil(data.online / data.page_size));
    if (page > pages) {
      page = pages;
      pending = undefined;
      load();
      return;
    }
    render(data);
    connection("Live", true);
    form.hidden = true;
    dashboard.hidden = actions.hidden = disconnect.hidden = false;
  } catch {
    if (pending !== request) return;
    if (dashboard.hidden) reset("Couldn't connect to the presence Worker. Check its URL and Pages origin.");
    else connection("Reconnecting", false);
  } finally {
    clearTimeout(timeout);
    if (pending === request) {
      pending = undefined;
      refresh.disabled = false;
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
      if (key && !document.hidden) timer = setTimeout(load, refreshPeriod);
    }
  }
}

if (!endpoint) {
  connectButton.disabled = input.disabled = true;
  error("Set the presence Worker URL in config.js.");
}
form.addEventListener("submit", event => {
  event.preventDefault();
  if (!endpoint || pending) return;
  key = input.value.trim();
  if (!key) return;
  input.value = "";
  error("");
  connectButton.disabled = true;
  load();
});
disconnect.addEventListener("click", () => reset());
refresh.addEventListener("click", load);
previous.addEventListener("click", () => {
  if (!pending && page > 1) { page--; load(); }
});
next.addEventListener("click", () => {
  if (!pending && page < pages) { page++; load(); }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(timer);
  else if (key) load();
});
