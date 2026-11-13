import { DAYS, START, END, timeLabel, durationLabel, validateData, daySegments } from "./schedule.mjs";

const $ = id => document.getElementById(id);
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const palette = [["#fff0c5", "#6b5420"], ["#fce7eb", "#b31b3a"], ["#eae8e1", "#504e45"], ["#f8e6c5", "#88602a"], ["#f2ede2", "#7a7056"]];
const storageKey = "sabc-planner-selected-v1";
let data = null;
let selectedIds = [];
let pickerOpen = false;
let activeOption = -1;
let matchingMembers = [];
let week = [];
let noticeTimer;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function selectedMembers() {
  const byId = new Map((data?.members || []).map(member => [member.id, member]));
  return selectedIds.map(id => byId.get(id)).filter(Boolean);
}

function saveSelection() {
  try { localStorage.setItem(storageKey, JSON.stringify(selectedIds)); } catch { /* Private browsing may disable storage. */ }
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}

function avatar(member) {
  const index = (data?.members || []).findIndex(value => value.id === member.id);
  const [background, color] = palette[Math.max(index, 0) % palette.length];
  const node = el("span", "avatar", initials(member.name));
  node.style.background = background;
  node.style.color = color;
  node.setAttribute("aria-hidden", "true");
  return node;
}

function showNotice(message, kind = "error") {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").className = `notice ${kind}`;
  $("notice").hidden = !message;
  if (kind === "success") noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 7000);
}

async function request(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(10000), ...options });
  let result;
  try { result = await response.json(); } catch { throw new Error("The saved availability could not be read."); }
  if (!response.ok) throw new Error(result.error || "The saved availability could not be loaded. Please try again later.");
  return result;
}

async function loadAvailability() {
  const result = validateData(await request("./data/availability.json"));
  data = result;
  data.members.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  selectedIds = selectedIds.filter(id => data.members.some(member => member.id === id));
  saveSelection();
  $("member-search").disabled = false;
  $("toggle-picker").disabled = false;
  $("member-total").textContent = `${data.members.length} club members · selections saved on this device`;
  const scraped = new Date(data.scraped_at);
  const stale = !Number.isFinite(scraped.getTime()) || Date.now() - scraped.getTime() > 24 * 60 * 60 * 1000;
  let formatted = "unknown";
  if (Number.isFinite(scraped.getTime())) {
    try {
      formatted = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: data.timezone }).format(scraped);
    } catch { formatted = scraped.toLocaleString("en-GB"); }
  }
  $("updated-at").textContent = `Last updated ${formatted}${stale ? " · data may be out of date" : ""}`;
  $("updated-at").classList.toggle("stale", stale);
  $("updated-at").title = `Scraped ${data.scraped_at}. Calendar times: ${data.timezone || "Europe/London"}.`;
  $("calendar-timezone").textContent = data.timezone || "Europe/London";
  render();
  if (pickerOpen) renderOptions();
}

function toggleMember(id) {
  selectedIds = selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id];
  saveSelection();
  render();
  renderOptions();
}

function setPicker(open) {
  pickerOpen = open && Boolean(data);
  $("member-dropdown").hidden = !pickerOpen;
  $("member-search").setAttribute("aria-expanded", String(pickerOpen));
  $("toggle-picker").setAttribute("aria-expanded", String(pickerOpen));
  if (pickerOpen) renderOptions();
  else $("member-search").removeAttribute("aria-activedescendant");
}

function markActiveOption() {
  const buttons = [...$("member-options").querySelectorAll(".member-option")];
  buttons.forEach((button, index) => button.classList.toggle("active", index === activeOption));
  if (pickerOpen && buttons[activeOption]) {
    $("member-search").setAttribute("aria-activedescendant", buttons[activeOption].id);
    buttons[activeOption].scrollIntoView({ block: "nearest" });
  } else $("member-search").removeAttribute("aria-activedescendant");
}

function renderOptions() {
  const query = $("member-search").value.trim().toLocaleLowerCase();
  matchingMembers = (data?.members || []).filter(member => member.name.toLocaleLowerCase().includes(query));
  $("dropdown-caption").textContent = query ? `${matchingMembers.length} matching members` : `All ${data?.members.length || 0} club members`;
  const fragment = document.createDocumentFragment();
  matchingMembers.forEach((member, index) => {
    const chosen = selectedIds.includes(member.id);
    const button = el("button", "member-option");
    button.type = "button";
    button.id = `member-option-${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(chosen));
    button.tabIndex = -1;
    button.append(avatar(member), el("span", "option-name", member.name), el("span", "option-check", chosen ? "✓" : "+"));
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", () => {
      toggleMember(member.id);
      $("member-search").focus();
    });
    fragment.append(button);
  });
  if (!matchingMembers.length) fragment.append(el("p", "muted-empty", "No matching members."));
  $("member-options").replaceChildren(fragment);
  activeOption = Math.min(activeOption, matchingMembers.length - 1);
  markActiveOption();
}

function renderCrew(members) {
  $("crew-count").textContent = members.length;
  $("clear-button").disabled = !members.length;
  $("crew-empty").hidden = Boolean(members.length);
  const fragment = document.createDocumentFragment();
  for (const member of members) {
    const chip = el("div", "member-chip");
    const remove = el("button", "remove-member", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${member.name}`);
    remove.addEventListener("click", () => {
      toggleMember(member.id);
      setPicker(false);
      // Keep keyboard focus on a control without focusing the search field.
      const nextControl = $("selected-members").querySelector(".remove-member") || $("toggle-picker");
      nextControl.focus({ preventScroll: true });
    });
    chip.append(avatar(member), el("span", "chip-name", member.name), remove);
    fragment.append(chip);
  }
  $("selected-members").replaceChildren(fragment);
}

function focusBlock(dayIndex, segment, scroll = false) {
  document.querySelectorAll(".calendar-block.chosen").forEach(block => block.classList.remove("chosen"));
  const block = document.getElementById(`block-${dayIndex}-${segment.start}`);
  block?.classList.add("chosen");
  if (scroll && block) {
    const scroller = $("calendar-scroll");
    const column = block.parentElement;
    const railWidth = document.querySelector(".time-rail").offsetWidth;
    scroller.scrollTo({ top: Math.max(0, (segment.start - START) / (END - START) * column.clientHeight - 20), left: Math.max(0, column.offsetLeft - railWidth), behavior: "smooth" });
    block.focus({ preventScroll: true });
  }
}

function renderCalendar(members) {
  const slotHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-height"));
  const fragment = document.createDocumentFragment();
  fragment.append(el("div", "calendar-corner", "TIME"));
  week = DAYS.map(day => daySegments(members, day));
  dayNames.forEach((name, index) => {
    const heading = el("div", `day-heading${index >= 5 ? " weekend" : ""}`);
    const freeMinutes = week[index].filter(segment => !segment.busyIds.length).reduce((total, segment) => total + segment.end - segment.start, 0);
    heading.append(el("span", "day-name", name), el("span", `day-free${members.length && freeMinutes ? " has-free" : ""}`, members.length ? `${durationLabel(freeMinutes)} shared` : "—"));
    fragment.append(heading);
  });
  const rail = el("div", "time-rail");
  for (let minute = START; minute <= END; minute += 30) {
    const tick = el("span", `time-tick${minute % 60 === 0 ? " hour" : ""}`, timeLabel(minute));
    tick.style.top = `${(minute - START) / (END - START) * 100}%`;
    rail.append(tick);
  }
  fragment.append(rail);
  week.forEach((segments, dayIndex) => {
    const column = el("div", "day-column");
    column.setAttribute("aria-label", dayNames[dayIndex]);
    segments.forEach(segment => {
      const busy = members.filter(member => segment.busyIds.includes(member.id));
      const block = el("button", `calendar-block ${busy.length ? "busy" : "free"}`);
      block.type = "button";
      block.id = `block-${dayIndex}-${segment.start}`;
      block.style.top = `${(segment.start - START) / (END - START) * 100}%`;
      block.style.height = `${(segment.end - segment.start) / (END - START) * 100}%`;
      const time = `${timeLabel(segment.start)}–${timeLabel(segment.end)}`;
      const label = busy.length ? `${busy.length} unavailable` : "Everyone free";
      const fullLabel = `${dayNames[dayIndex]}, ${time}. ${busy.length ? `Unavailable: ${busy.map(member => member.name).join(", ")}` : "Everyone selected is free"}.`;
      block.title = fullLabel;
      block.setAttribute("aria-label", fullLabel);
      const height = (segment.end - segment.start) / 30 * slotHeight;
      if (height >= 25) block.append(el("span", "block-label", label));
      if (height >= 48) block.append(el("span", "block-time", time));
      if (height >= 100 && busy.length) block.append(el("span", "block-names", busy.map(member => member.name).join(", ")));
      block.addEventListener("click", () => focusBlock(dayIndex, segment));
      column.append(block);
    });
    fragment.append(column);
  });
  $("calendar-grid").replaceChildren(fragment);
  $("calendar-empty").hidden = Boolean(members.length);
}

function renderWindows(members) {
  let total = 0, count = 0;
  const fragment = document.createDocumentFragment();
  week.forEach((segments, dayIndex) => {
    const free = segments.filter(segment => !segment.busyIds.length);
    if (!free.length) return;
    fragment.append(el("p", "window-day", dayNames[dayIndex]));
    for (const segment of free) {
      count++;
      total += segment.end - segment.start;
      const button = el("button", "window-button");
      button.type = "button";
      button.append(el("span", "", `${timeLabel(segment.start)} – ${timeLabel(segment.end)}`), el("span", "", durationLabel(segment.end - segment.start)));
      button.setAttribute("aria-label", `${dayNames[dayIndex]} shared window ${timeLabel(segment.start)} to ${timeLabel(segment.end)}`);
      button.addEventListener("click", () => focusBlock(dayIndex, segment, true));
      fragment.append(button);
    }
  });
  if (!count) fragment.append(el("p", "muted-empty", members.length ? "No shared free time between 06:00 and 20:00 for this crew. Try removing a member." : "Select members to find a time together."));
  $("shared-windows").replaceChildren(fragment);
  $("window-count").textContent = members.length ? `${count} ${count === 1 ? "window" : "windows"}` : "—";
  $("windows-summary").textContent = members.length ? `${durationLabel(total)} together across the week.` : "Your shared free time, at a glance.";
  $("shared-total").textContent = members.length ? `${durationLabel(total)} shared · ${members.length} selected` : "Choose your crew to see shared hours";
}

function render() {
  const members = selectedMembers();
  renderCrew(members);
  renderCalendar(members);
  renderWindows(members);
}

$("member-search").addEventListener("focus", () => setPicker(true));
$("member-search").addEventListener("click", () => { if (!pickerOpen) setPicker(true); });
$("member-search").addEventListener("input", () => { activeOption = -1; setPicker(true); });
$("toggle-picker").addEventListener("click", () => {
  const open = !pickerOpen;
  $("member-search").focus();
  setPicker(open);
});
$("member-search").addEventListener("keydown", event => {
  if (event.key === "Escape") { setPicker(false); return; }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!pickerOpen) setPicker(true);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeOption = Math.max(0, Math.min(matchingMembers.length - 1, activeOption + direction));
    markActiveOption();
  } else if (event.key === "Enter" && pickerOpen) {
    event.preventDefault();
    const member = matchingMembers[activeOption >= 0 ? activeOption : 0];
    if (member) toggleMember(member.id);
  }
});
document.addEventListener("pointerdown", event => { if (!$("member-picker").contains(event.target)) setPicker(false); });
$("member-picker").addEventListener("focusout", event => { if (!$("member-picker").contains(event.relatedTarget)) setPicker(false); });
$("clear-button").addEventListener("click", () => { selectedIds = []; saveSelection(); render(); renderOptions(); });

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved)) selectedIds = [...new Set(saved.filter(id => typeof id === "string"))];
} catch { /* Start with an empty crew if saved settings cannot be read. */ }
render();
try { await loadAvailability(); }
catch (error) {
  $("updated-at").textContent = "No availability loaded";
  $("member-total").textContent = "Saved availability is currently unavailable.";
  showNotice(error.message);
}
