"use strict";
/* Lumina — интерфейс. Работает одинаково в окне программы на ПК и в Safari на iPhone. */

const D = window.luminaDesktop || null;
const S = {bots: [], personas: [], settings: {}, engine: {status: "idle"}, local: false, metaRev: 0, chatRev: 0};
const view = document.getElementById("view");
const COLORS = ["#8b5cf6", "#d946ef", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#64748b"];
const isTouch = matchMedia("(pointer: coarse)").matches;
let pageCleanup = null;
const engineListeners = new Set();
const syncListeners = new Set(); // вызываются, когда данные изменились на другом устройстве

/* ================= настройки этого устройства (шрифт, фон) ================= */
const PREF_DEFAULTS = {fontSize: 16, fontFamily: "sans", bgMode: "sharp", bgDim: 0.55, blocks: true, blockIcons: true};
function getPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem("lumina_prefs") || "{}") || {}; } catch {}
    return {...PREF_DEFAULTS, ...p};
}
function setPref(k, v) {
    const p = getPrefs(); p[k] = v;
    try { localStorage.setItem("lumina_prefs", JSON.stringify(p)); } catch {}
    applyPrefs();
}
function applyPrefs() {
    const p = getPrefs(), r = document.documentElement;
    r.style.setProperty("--chat-fs", p.fontSize + "px");
    r.style.setProperty("--bg-dim", String(p.bgDim));
    r.dataset.ff = p.fontFamily;
    r.dataset.bg = p.bgMode;
}
applyPrefs();

/* ================= утилиты ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function timeAgo(ts) {
    if (!ts) return "";
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return "только что";
    if (d < 3600) return Math.floor(d / 60) + " мин";
    if (d < 86400) return Math.floor(d / 3600) + " ч";
    if (d < 86400 * 7) return Math.floor(d / 86400) + " дн";
    return new Date(ts).toLocaleDateString("ru-RU", {day: "numeric", month: "short"});
}
function fmtSize(b) {
    if (b == null) return "";
    if (b > 1e9) return (b / 1e9).toFixed(1) + " ГБ";
    return Math.round(b / 1e6) + " МБ";
}
function shade(hex, k = -0.45) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function grad(color) {
    const c = color || "#8b5cf6";
    return `linear-gradient(160deg, ${c} 0%, ${shade(c, -0.55)} 100%)`;
}
function initial(name) { return esc((name || "?").trim().charAt(0).toUpperCase() || "?"); }
function avatarHTML(e, cls = "") {
    if (e?.avatar) return `<div class="av ${cls}"><img src="${e.avatar}" alt=""></div>`;
    return `<div class="av ${cls}" style="background:${grad(e?.color || "#6d28d9")}">${initial(e?.name)}</div>`;
}
function artHTML(bot) {
    if (bot.avatar) return `<img src="${bot.avatar}" alt="" loading="lazy">`;
    return `<div class="letter-art" style="background:${grad(bot.color)}">${initial(bot.name)}</div>`;
}
function macros(t, bot, persona) {
    return String(t || "").replace(/\{\{char\}\}|<BOT>/gi, bot?.name || "Персонаж").replace(/\{\{user\}\}|<USER>/gi, persona?.name || "Вы");
}
function fmt(t) {
    let s = esc(t);
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+?)\*/g, '<em class="act">$1</em>');
    s = s.replace(/\*([^*\n]+)$/, '<em class="act">$1</em>');
    s = s.replace(/(&quot;|«)([^\n]+?)(&quot;|»)/g, '<span class="q">$1$2$3</span>');
    // строки прямой речи через тире — как в книгах
    s = s.replace(/(^|\n)[—–]\s/g, '$1<span class="dash">—</span> ');
    // абзацы: пустая строка = новый абзац
    return s.split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, "<br>")}</p>`).join("");
}
/* Ответ бота блоками: *действие*, — реплика, ((мысли)). Остальной текст — повествование. */
function parseBlocks(t) {
    const out = [];
    const push = (k, txt) => {
        txt = String(txt || "").trim();
        if (!txt || /^[\s.,!?…;:]+$/.test(txt)) return;
        if (k === "text") k = /^[—–-]\s?/.test(txt) || /^[«"„]/.test(txt) ? "speech" : "narr";
        out.push({k, t: txt});
    };
    for (const line of String(t || "").split(/\n+/)) {
        if (!line.trim()) continue;
        // ((мысли)) · *действие* · незакрытые варианты в конце строки (во время печати)
        const re = /\(\(([\s\S]+?)\)\)|\*\*([^*]+?)\*\*|\*([^*]+?)\*|\(\(([^)]*)$|\*([^*]+)$/g;
        let last = 0, m;
        while ((m = re.exec(line))) {
            push("text", line.slice(last, m.index));
            if (m[1] != null || m[4] != null) push("thought", m[1] ?? m[4]);
            else if (m[2] != null) push("text", m[2]);
            else push("act", m[3] ?? m[5]);
            last = re.lastIndex;
        }
        push("text", line.slice(last));
    }
    // в ролевом формате (*действия* есть) обычный текст — это прямая речь
    if (out.some(b => b.k === "act")) out.forEach(b => { if (b.k === "narr") b.k = "speech"; });
    // соседние блоки одного типа (кроме реплик) склеиваем
    const merged = [];
    for (const b of out) {
        const prev = merged[merged.length - 1];
        if (prev && prev.k === b.k && b.k !== "speech") prev.t += " " + b.t;
        else merged.push({...b});
    }
    return merged;
}
const BLOCK_ICON = {act: "ic-hand", narr: "ic-hand", speech: "ic-quote", thought: "ic-cloud"};
const BLOCK_TITLE = {act: "Действие", narr: "Описание", speech: "Реплика", thought: "Мысли"};
function fmtBot(t) {
    if (!getPrefs().blocks) return fmt(t);
    const blocks = parseBlocks(t);
    if (!blocks.length) return "";
    const icons = getPrefs().blockIcons;
    return blocks.map(b => {
        let h = esc(b.t).replace(/(&quot;|«)([^\n]+?)(&quot;|»)/g, '<span class="q">$1$2$3</span>');
        if (b.k === "speech") h = h.replace(/^[—–-]\s?/, '<span class="dash">—</span> ');
        return `<div class="blk blk-${b.k}">${icons ? `<i class="ic ${BLOCK_ICON[b.k]} bi" title="${BLOCK_TITLE[b.k]}"></i>` : ""}<div class="bt">${h}</div></div>`;
    }).join("");
}
function allStyles() {
    const pr = S.settings.presets || {styles: {}};
    const o = {...pr.styles};
    for (const c of S.settings.customStyles || []) o["c:" + c.id] = {label: "★ " + c.label, rules: c.rules, example: c.example, custom: true, id: c.id};
    return o;
}
function currentText(m) {
    if (m.swipes && m.swipes.length) return m.swipes[m.swipeIndex ?? 0] ?? "";
    return m.text ?? "";
}
function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ================= API ================= */
function authHeaders() {
    const t = localStorage.getItem("lumina_token");
    return t ? {"X-Lumina-Auth": t} : {};
}
async function api(method, url, body) {
    const r = await fetch(url, {
        method,
        headers: {...(body ? {"Content-Type": "application/json"} : {}), ...authHeaders()},
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin"
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (r.status === 401 && data.error === "auth") { showPin(); throw new Error("Требуется вход"); }
    if (!r.ok) throw new Error(data.error || ("Ошибка " + r.status));
    return data;
}
async function loadState() {
    const st = await api("GET", "/api/state");
    S.bots = st.bots; S.personas = st.personas; S.settings = st.settings; S.engine = st.engine; S.local = st.local;
    S.metaRev = st.metaRev; S.chatRev = st.chatRev;
    renderPill();
}

/* ================= toast / modal ================= */
function toast(msg, {error = false, link = null, ms = 3500} = {}) {
    const el = document.createElement("div");
    el.className = "toast" + (error ? " err" : "");
    el.innerHTML = esc(msg) + (link ? ` <a href="${link.href}">${esc(link.text)}</a>` : "");
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.transition = ".3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, ms);
}
function modal(html, {onMount, wide = false} = {}) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" style="${wide ? "max-width:640px" : ""}">${html}</div>`;
    const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
    document.addEventListener("keydown", onKey);
    $("#modalRoot").appendChild(bg);
    const api = {el: bg.firstElementChild, close};
    onMount?.(api);
    return api;
}
function confirmBox(title, text, {ok = "Удалить", danger = true} = {}) {
    return new Promise((resolve) => {
        modal(`<h3>${esc(title)}</h3><div class="muted">${esc(text)}</div>
            <div class="btns"><button class="btn" data-x>Отмена</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(ok)}</button></div>`, {
            onMount: (m) => {
                $("[data-x]", m.el).onclick = () => { m.close(); resolve(false); };
                $("[data-ok]", m.el).onclick = () => { m.close(); resolve(true); };
            }
        });
    });
}
function sheet(title, items) {
    // items: [{label, icon, on, danger, onClick}]
    return modal(`<h3>${esc(title)}</h3><div class="sheet-list">${items.map((it, i) =>
        `<button data-i="${i}" class="${it.on ? "on" : ""} ${it.danger ? "danger" : ""}">${it.html || `${it.icon ? `<i class="ic ${it.icon}"></i>` : ""}<span>${esc(it.label)}</span>`}</button>`).join("")}</div>`, {
        onMount: (m) => $$("[data-i]", m.el).forEach(b => b.onclick = () => { m.close(); items[+b.dataset.i].onClick?.(); })
    });
}

/* ================= картинки и карточки ================= */
function pickFile(accept, multiple = false) {
    return new Promise((resolve) => {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = accept; inp.multiple = multiple;
        inp.onchange = () => resolve(multiple ? [...inp.files] : inp.files[0] || null);
        inp.click();
    });
}
function imageToDataURL(file, max = 768) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement("canvas");
            c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось открыть изображение")); };
        img.src = url;
    });
}
function b64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}
async function parseCardPNG(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const latin = (a) => { let s = ""; for (const x of a) s += String.fromCharCode(x); return s; };
    const found = {};
    let off = 8;
    while (off + 8 <= buf.length) {
        const len = dv.getUint32(off);
        const type = latin(buf.subarray(off + 4, off + 8));
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === "tEXt") {
            const z = data.indexOf(0);
            found[latin(data.subarray(0, z)).toLowerCase()] = latin(data.subarray(z + 1));
        } else if (type === "iTXt") {
            const z = data.indexOf(0);
            const key = latin(data.subarray(0, z)).toLowerCase();
            if (data[z + 1] === 0) {
                let p = z + 3;
                p = data.indexOf(0, p) + 1; // language
                p = data.indexOf(0, p) + 1; // translated keyword
                found[key] = new TextDecoder().decode(data.subarray(p));
            }
        }
        if (type === "IEND") break;
        off += 12 + len;
    }
    const raw = found.ccv3 || found.chara;
    if (!raw) throw new Error("В этой картинке нет данных персонажа");
    let txt = raw.trim();
    if (!txt.startsWith("{")) txt = b64ToUtf8(txt);
    return JSON.parse(txt);
}
function cardToBot(j) {
    const d = j.data || j;
    const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const notes = strip(d.creator_notes || d.creatorcomment || "");
    return {
        name: d.name || d.char_name || "Без имени",
        tagline: notes.slice(0, 140),
        description: d.description || d.char_persona || "",
        personality: d.personality || "",
        scenario: d.scenario || d.world_scenario || "",
        greeting: d.first_mes || d.char_greeting || "",
        altGreetings: d.alternate_greetings || [],
        examples: d.mes_example || d.example_dialogue || "",
        rules: [d.system_prompt, d.post_history_instructions].filter(Boolean).join("\n\n").replace(/\{\{original\}\}/gi, "").trim(),
        tags: (d.tags || []).slice(0, 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
}
async function importCards() {
    const files = await pickFile(".png,.json,image/png,application/json", true);
    if (!files || !files.length) return;
    let n = 0;
    for (const f of files) {
        try {
            let bot;
            if (f.name.toLowerCase().endsWith(".json")) {
                bot = cardToBot(JSON.parse(await f.text()));
            } else {
                bot = cardToBot(await parseCardPNG(f));
                bot.avatar = await imageToDataURL(f, 768);
            }
            const saved = await api("POST", "/api/bots", bot);
            S.bots.unshift(saved);
            n++;
        } catch (e) {
            toast(`${f.name}: ${e.message}`, {error: true, ms: 5000});
        }
    }
    if (n) { toast(n === 1 ? "Персонаж импортирован" : `Импортировано персонажей: ${n}`); route(); }
}

/* ================= статус модели ================= */
function engineLabel(e = S.engine) {
    if (e.status === "ready") return {cls: "ready", title: "Модель готова", sub: e.modelName || ""};
    if (e.status === "loading") return {cls: "loading", title: `Загрузка ${Math.round((e.progress || 0) * 100)}%`, sub: e.modelName || ""};
    if (e.status === "error") return {cls: "error", title: "Ошибка модели", sub: e.error || ""};
    return {cls: "", title: "Модель не загружена", sub: "Нажмите, чтобы выбрать"};
}
/* ================= ответ пришёл: звук, вибрация, уведомление ================= */
let audioCtx = null;
// iOS разрешает звук только после касания — «будим» звук при первом действии пользователя
document.addEventListener("pointerdown", () => {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch {}
}, {once: false, passive: true});
function chime() {
    if (getPrefs().sound === false || !audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        [[880, 0], [1320, 0.12]].forEach(([f, d]) => {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = "sine"; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t + d);
            g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
            o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + 0.4);
        });
    } catch {}
}
function replyArrived(name) {
    chime();
    try { navigator.vibrate?.([60, 40, 60]); } catch {}
    if (document.hidden) document.title = `💬 ${name} ответил(а) — Lumina`;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) document.title = "Lumina"; });

// «MN-12B-Runeweaver-RP-RU.Q4_K_S.gguf» → «MN-12B-Runeweaver-RP-RU»
function shortModelName(n) {
    return String(n || "").replace(/\.gguf$/i, "").replace(/[.\-_](i1-)?(I?Q\d[\w]*|F16|BF16|F32)$/i, "") || "модель";
}
function renderPill() {
    const l = engineLabel();
    $("#enginePill").innerHTML = `<span class="dot ${l.cls}"></span><span class="t"><b>${esc(l.title)}</b><span>${esc(l.sub)}</span></span>`;
}
async function pollEngine() {
    try {
        const r = await api("GET", "/api/engine");
        const {metaRev, chatRev, ...e} = r;
        const changed = JSON.stringify(e) !== JSON.stringify(S.engine);
        S.engine = e;
        if (changed) { renderPill(); engineListeners.forEach(fn => fn(e)); }
        const metaChanged = metaRev && metaRev !== S.metaRev;
        const chatChanged = chatRev && chatRev !== S.chatRev;
        if (metaChanged || chatChanged) await onRemoteChange({metaChanged, chatChanged, metaRev, chatRev});
    } catch {}
    setTimeout(pollEngine, S.engine.status === "loading" ? 500 : 2000);
}

/* ================= синхронизация ПК ⇄ телефон =================
   Все данные хранятся на компьютере; телефон работает с ними напрямую.
   Здесь мы следим за изменениями, сделанными на другом устройстве, и обновляем экран. */
function userIsBusy() {
    const a = document.activeElement;
    return !!($("#modalRoot").children.length || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
}
const LIVE_PAGES = /^#?\/?$|^#\/chats$|^#\/bot\/[a-f0-9]{16}$|^#\/personas$/;
let deferredSync = false;
async function onRemoteChange({metaChanged, chatChanged, metaRev, chatRev}) {
    if (metaChanged) {
        try { await loadState(); } catch { return; }
    }
    S.metaRev = metaRev || S.metaRev; S.chatRev = chatRev || S.chatRev;
    syncListeners.forEach(fn => { try { fn({metaChanged, chatChanged}); } catch {} });
    if (LIVE_PAGES.test(location.hash || "#/")) {
        if (userIsBusy()) deferredSync = true;
        else rerender();
    }
}
async function rerender() {
    deferredSync = false;
    const top = view.scrollTop;
    await route({keepScroll: true});
    view.scrollTop = top;
}
document.addEventListener("focusout", () => setTimeout(() => { if (deferredSync && !userIsBusy()) rerender(); }, 300));
async function syncNow(btn) {
    btn?.classList.add("spin");
    try {
        await loadState();
        await route({keepScroll: true});
        toast("Синхронизировано: данные с компьютера и телефона совпадают");
    } catch (e) { toast(e.message, {error: true}); }
    finally { setTimeout(() => btn?.classList.remove("spin"), 600); }
}
function syncBtnHTML() {
    return `<button class="btn icon rb sync-mini" data-sync title="Синхронизировать с другим устройством"><i class="ic ic-sync"></i></button>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-sync]"); if (b) syncNow(b); });
function engineBanner() {
    const e = S.engine;
    if (e.status === "ready") return "";
    if (e.status === "loading") return `<div class="banner"><i class="ic ic-chip"></i><div class="grow"><b>Модель загружается…</b><div class="progress"><i style="width:${Math.round((e.progress || 0) * 100)}%"></i></div></div></div>`;
    return `<div class="banner"><i class="ic ic-spark"></i><div class="grow"><b>${e.status === "error" ? "Не удалось загрузить модель" : "ИИ-модель ещё не выбрана"}</b>
        <div class="muted small">${e.status === "error" ? esc(e.error) : "Чтобы персонажи могли отвечать, добавьте файл модели в формате .gguf."}</div></div>
        <a class="btn sm primary" href="#/model">Открыть</a></div>`;
}

/* ================= роутер ================= */
const routes = [
    [/^#?\/?$/, () => pageHome()],
    [/^#\/chats$/, () => pageChats()],
    [/^#\/bot\/new$/, () => pageBotEdit(null)],
    [/^#\/bot\/([a-f0-9]{16})\/edit$/, (m) => pageBotEdit(m[1])],
    [/^#\/bot\/([a-f0-9]{16})$/, (m) => pageBot(m[1])],
    [/^#\/chat\/([a-f0-9]{16})$/, (m) => pageChat(m[1])],
    [/^#\/personas$/, () => pagePersonas()],
    [/^#\/lore$/, () => pageLore()],
    [/^#\/model$/, () => pageModel()],
    [/^#\/settings$/, () => pageSettings()]
];
async function route({keepScroll = false} = {}) {
    if (pageCleanup) { try { pageCleanup(); } catch {} pageCleanup = null; }
    engineListeners.clear();
    syncListeners.clear();
    const h = location.hash || "#/";
    const section = h.startsWith("#/chat") ? "chats" : h.startsWith("#/bot") || h === "#/" ? "home" : h.slice(2).split("/")[0];
    $$("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === section));
    document.body.classList.toggle("in-chat", h.startsWith("#/chat/"));
    if (!keepScroll) view.scrollTop = 0;
    for (const [re, fn] of routes) {
        const m = h.match(re);
        if (m) {
            try { await fn(m); } catch (e) { if (e.message !== "Требуется вход") view.innerHTML = `<div class="page"><div class="empty"><div class="big">⚠️</div>${esc(e.message)}</div></div>`; }
            return;
        }
    }
    location.hash = "#/";
}
window.addEventListener("hashchange", route);

/* ================= страница: персонажи ================= */
async function pageHome() {
    const recent = (await api("GET", "/api/chats").catch(() => [])).slice(0, 8);
    view.innerHTML = `<div class="page">
        <div class="page-head">
            <h1>Персонажи</h1>
            ${syncBtnHTML()}
            <div class="search"><i class="ic ic-search"></i><input class="input" id="q" placeholder="Поиск" autocomplete="off"></div>
            <button class="btn rb" id="imp" title="Импорт карточки персонажа (.png / .json)"><i class="ic ic-upload"></i><span class="lbl">Импорт</span></button>
            <button class="btn primary rb" id="new"><i class="ic ic-plus"></i><span class="lbl">Создать</span></button>
        </div>
        <div id="bannerSlot">${engineBanner()}</div>
        ${recent.length ? `<div class="sec-title">Продолжить</div><div class="recent">${recent.map(c => {
            const b = S.bots.find(x => x.id === c.botId);
            if (!b) return "";
            const last = c.last ? (c.last.role === "user" ? "Вы: " : "") + macros(c.last.text, b, S.personas.find(p => p.id === c.personaId)) : "Новый чат";
            return `<div class="rc" data-chat="${c.id}">${avatarHTML(b, "lg")}<div class="t"><b>${esc(b.name)}</b><span>${esc(last)}</span><em>${timeAgo(c.updatedAt)}</em></div></div>`;
        }).join("")}</div><div class="sec-title">Все персонажи</div>` : ""}
        <div class="grid" id="grid"></div>
    </div>`;
    $$(".recent [data-chat]").forEach(el => el.onclick = () => location.hash = "#/chat/" + el.dataset.chat);
    const draw = (q = "") => {
        q = q.toLowerCase().trim();
        const list = S.bots.filter(b => !q || [b.name, b.tagline, ...(b.tags || [])].join(" ").toLowerCase().includes(q));
        $("#grid").innerHTML = `<div class="ccard add" id="addCard"><div class="plus"><i class="ic ic-plus"></i></div>Новый персонаж</div>` +
            list.map(b => `<div class="ccard" data-id="${b.id}">
                <div class="art">${artHTML(b)}</div><div class="shade"></div>
                <div class="info"><div class="name">${esc(b.name)}</div>
                ${b.tagline ? `<div class="tl">${esc(b.tagline)}</div>` : ""}
                ${b.tags?.length ? `<div class="tags">${b.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
                </div></div>`).join("");
        $("#addCard").onclick = () => location.hash = "#/bot/new";
        $$(".ccard[data-id]").forEach(c => c.onclick = () => location.hash = "#/bot/" + c.dataset.id);
    };
    draw();
    $("#q").oninput = (e) => draw(e.target.value);
    $("#new").onclick = () => location.hash = "#/bot/new";
    $("#imp").onclick = importCards;
    engineListeners.add(() => { $("#bannerSlot").innerHTML = engineBanner(); });
}

/* ================= страница: профиль персонажа ================= */
async function pageBot(id) {
    const bot = S.bots.find(b => b.id === id);
    if (!bot) { location.hash = "#/"; return; }
    const chats = await api("GET", "/api/chats?botId=" + id);
    view.innerHTML = `<div class="page">
        <div class="hero">
            <div class="bgart">${bot.avatar ? `<img src="${bot.avatar}">` : `<div style="width:100%;height:100%;background:${grad(bot.color)}"></div>`}</div>
            <div class="inner">
                <div class="portrait">${artHTML(bot)}</div>
                <div class="grow">
                    <h1>${esc(bot.name)}</h1>
                    ${bot.tagline ? `<div class="tl">${esc(bot.tagline)}</div>` : ""}
                    <div class="row wrap" style="gap:6px">${(bot.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
                    <div class="actions">
                        ${chats.length ? `<button class="btn primary" id="cont"><i class="ic ic-chat"></i>Продолжить</button><button class="btn" id="newc"><i class="ic ic-plus"></i>Новый чат</button>`
                                       : `<button class="btn primary" id="newc"><i class="ic ic-chat"></i>Начать чат</button>`}
                        <button class="btn" id="edit"><i class="ic ic-edit"></i>Изменить</button>
                        <button class="btn icon danger" id="del" title="Удалить"><i class="ic ic-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>
        ${bot.description ? `<h2>О персонаже</h2><div class="card desc-block">${esc(macros(bot.description, bot))}</div>` : ""}
        ${chats.length ? `<h2>Чаты с ${esc(bot.name)}</h2><div class="list">${chats.map(c => chatRow(c, bot)).join("")}</div>` : ""}
    </div>`;
    const newChat = async () => {
        const c = await api("POST", "/api/chats", {botId: id});
        location.hash = "#/chat/" + c.id;
    };
    $("#newc").onclick = newChat;
    if ($("#cont")) $("#cont").onclick = () => location.hash = "#/chat/" + chats[0].id;
    $("#edit").onclick = () => location.hash = `#/bot/${id}/edit`;
    $("#del").onclick = async () => {
        if (!await confirmBox("Удалить персонажа?", `«${bot.name}» и все чаты с ним будут удалены без возможности восстановления.`)) return;
        await api("DELETE", "/api/bots/" + id);
        S.bots = S.bots.filter(b => b.id !== id);
        location.hash = "#/";
    };
    bindChatRows();
}
function chatRow(c, bot) {
    const persona = S.personas.find(p => p.id === c.personaId);
    const last = c.last ? (c.last.role === "user" ? "Вы: " : "") + macros(c.last.text, bot, persona) : "Пустой чат";
    return `<div class="li" data-chat="${c.id}">${avatarHTML(bot)}<div class="t"><b>${esc(bot?.name || "Удалённый персонаж")}</b><span>${esc(last)}</span></div>
        <span class="time">${timeAgo(c.updatedAt)}</span>
        <button class="btn ghost sm icon" data-delchat="${c.id}" title="Удалить чат"><i class="ic ic-trash ic-sm"></i></button></div>`;
}
function bindChatRows() {
    $$("[data-chat]").forEach(el => el.onclick = (e) => {
        if (e.target.closest("[data-delchat]")) return;
        location.hash = "#/chat/" + el.dataset.chat;
    });
    $$("[data-delchat]").forEach(b => b.onclick = async () => {
        if (!await confirmBox("Удалить чат?", "История переписки будет удалена.")) return;
        await api("DELETE", "/api/chats/" + b.dataset.delchat);
        b.closest(".li").remove();
    });
}

/* ================= страница: все чаты ================= */
async function pageChats() {
    const chats = await api("GET", "/api/chats");
    view.innerHTML = `<div class="page narrow">
        <div class="page-head"><h1>Чаты</h1>${syncBtnHTML()}</div>
        ${chats.length ? `<div class="list">${chats.map(c => chatRow(c, S.bots.find(b => b.id === c.botId))).join("")}</div>`
                       : `<div class="empty"><div class="big">💬</div>Пока нет ни одного чата.<br><br><a class="btn primary" href="#/">Выбрать персонажа</a></div>`}
    </div>`;
    bindChatRows();
}

/* ================= страница: редактор персонажа ================= */
async function pageBotEdit(id) {
    const src = id ? S.bots.find(b => b.id === id) : null;
    if (id && !src) { location.hash = "#/"; return; }
    const f = src ? structuredClone(src) : {name: "", tagline: "", tags: [], avatar: null, color: COLORS[Math.floor(Math.random() * COLORS.length)], description: "", personality: "", scenario: "", greeting: "", examples: "", rules: ""};
    const fld = (key, label, hint, {rows = 4, ph = "", input = false} = {}) => `<div class="field"><label for="f_${key}">${label}</label>${hint ? `<div class="hint">${hint}</div>` : ""}
        ${input ? `<input class="input" id="f_${key}" data-k="${key}" value="${esc(f[key])}" placeholder="${esc(ph)}">`
                : `<textarea class="input" id="f_${key}" data-k="${key}" rows="${rows}" placeholder="${esc(ph)}">${esc(f[key])}</textarea>`}</div>`;
    view.innerHTML = `<div class="page">
        <div class="page-head"><a class="btn ghost icon" href="${id ? "#/bot/" + id : "#/"}"><i class="ic ic-back"></i></a><h1>${id ? "Редактирование" : "Новый персонаж"}</h1></div>
        <div class="editor">
            <div class="avatar-col">
                <div class="avatar-pick" id="ava">${f.avatar ? `<img src="${f.avatar}">` : `<div><i class="ic ic-upload" style="width:28px;height:28px"></i><div class="small" style="margin-top:8px">Загрузить<br>изображение</div></div>`}<div class="ov">Сменить изображение</div></div>
                <div>
                    <div class="small muted" style="margin-top:12px">Это изображение также становится фоном чата с персонажем.</div>
                    <div class="small muted" style="margin-top:12px">Цвет (если нет картинки)</div>
                    <div class="swatches">${COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${c === f.color ? "on" : ""}"></button>`).join("")}</div>
                    ${f.avatar ? `<button class="btn sm ghost" id="rmava" style="margin-top:12px">Убрать картинку</button>` : ""}
                </div>
            </div>
            <div>
                <div class="card">
                    ${fld("name", "Имя", "", {input: true, ph: "Например: Лира"})}
                    ${fld("tagline", "Короткое описание", "Видно на карточке персонажа", {input: true, ph: "Странствующая бардесса с тайной в прошлом"})}
                    <div class="field"><label for="f_tags">Теги</label><input class="input" id="f_tags" value="${esc((f.tags || []).join(", "))}" placeholder="фэнтези, романтика, приключения"></div>
                </div>
                <h2>Личность</h2>
                <div class="card">
                    ${fld("description", "Кто это", "Внешность, возраст, биография, профессия, отношения с собеседником.", {rows: 6, ph: "Лира — эльфийка-бардесса двадцати шести лет…"})}
                    ${fld("personality", "Характер и манера речи", "Черты характера, привычки, как говорит, что любит и не любит.", {rows: 4, ph: "Остроумная, любопытная, немного дерзкая…"})}
                </div>
                <h2>Сцена</h2>
                <div class="card">
                    ${fld("scenario", "Сценарий", "Где и при каких обстоятельствах начинается история.", {rows: 4, ph: "Таверна на перекрёстке дорог, поздний вечер…"})}
                    ${fld("greeting", "Первое сообщение", "С этого сообщения персонаж начинает каждый новый чат.", {rows: 5, ph: "*Лира откладывает лютню и садится напротив тебя.* Ну, путник, удиви меня."})}
                </div>
                <h2>Поведение бота</h2>
                <div class="card">
                    ${fld("rules", "Что делает бот и как себя ведёт", "Указания для ИИ: стиль, длина ответов, о чём говорить и о чём нет, особые механики игры.", {rows: 5, ph: "Отвечай 2–4 абзацами. Описывай окружение. Веди себя как ведущий игры…"})}
                    ${fld("examples", "Примеры реплик", "Необязательно. Пример ответа именно этого персонажа — помогает модели поймать его голос. Разметка: *действие*, — реплика, ((мысли)).", {rows: 6, ph: "*{{char}} усмехается и откидывается на спинку стула.*\n\n— Та, кого ты точно не забудешь.\n\n((Интересно, он правда меня не узнал?))"})}
                    <div class="hint small muted">В любом поле можно писать <span class="macro">{{char}}</span> — имя персонажа и <span class="macro">{{user}}</span> — имя вашей персоны.</div>
                </div>
                <div class="savebar">
                    <a class="btn" href="${id ? "#/bot/" + id : "#/"}">Отмена</a>
                    <button class="btn primary" id="save"><i class="ic ic-check"></i>Сохранить</button>
                </div>
            </div>
        </div>
    </div>`;
    $$("[data-k]").forEach(el => el.oninput = () => f[el.dataset.k] = el.value);
    $("#ava").onclick = async () => {
        const file = await pickFile("image/*");
        if (!file) return;
        try {
            f.avatar = await imageToDataURL(file, 1280);
            $("#ava").innerHTML = `<img src="${f.avatar}"><div class="ov">Сменить изображение</div>`;
        } catch (e) { toast(e.message, {error: true}); }
    };
    if ($("#rmava")) $("#rmava").onclick = () => { f.avatar = null; $("#ava").innerHTML = `<div class="small muted">Картинка убрана</div>`; $("#rmava").remove(); };
    $$("[data-c]").forEach(b => b.onclick = () => { f.color = b.dataset.c; $$("[data-c]").forEach(x => x.classList.toggle("on", x === b)); });
    $("#save").onclick = async () => {
        f.tags = $("#f_tags").value.split(",").map(s => s.trim()).filter(Boolean);
        if (!f.name.trim()) { toast("Укажите имя персонажа", {error: true}); $("#f_name").focus(); return; }
        $("#save").disabled = true;
        try {
            const saved = id ? await api("PUT", "/api/bots/" + id, f) : await api("POST", "/api/bots", f);
            if (id) S.bots = S.bots.map(b => b.id === id ? saved : b); else S.bots.unshift(saved);
            toast("Сохранено");
            location.hash = "#/bot/" + saved.id;
        } catch (e) { toast(e.message, {error: true}); $("#save").disabled = false; }
    };
}

/* ================= страница: чат ================= */
async function pageChat(id) {
    let chat = await api("GET", "/api/chats/" + id);
    const bot = S.bots.find(b => b.id === chat.botId);
    if (!bot) { view.innerHTML = `<div class="page"><div class="empty">Персонаж этого чата был удалён.</div></div>`; return; }
    let persona = S.personas.find(p => p.id === chat.personaId) || S.personas[0];
    let streaming = null; // {msgId|null, mode, text, el}
    let pollTimer = null;
    let alive = true;

    view.innerHTML = `<div class="chat">
        <div class="chat-bg">${bot.avatar ? `<img src="${bot.avatar}">` : ""}</div>
        <div class="chat-head">
            <button class="btn ghost icon" id="back" title="Назад"><i class="ic ic-back"></i></button>
            ${avatarHTML(bot)}
            <div class="who" id="who"><b>${esc(bot.name)}</b><span id="whoSub">${esc(bot.tagline || "")}</span></div>
            <button class="model-chip" id="mchip" title="ИИ-модель для ответов — нажмите, чтобы сменить"></button>
            <button class="persona-chip" id="pchip" title="Ваша персона"></button>
            <button class="btn ghost icon" id="csettings" title="Настройки чата: память, контекст, стиль, шрифт"><i class="ic ic-sliders"></i></button>
            <button class="btn ghost icon" id="menu"><i class="ic ic-more"></i></button>
        </div>
        <div class="messages" id="msgs"><div class="inner" id="inner"></div></div>
        <button class="to-bottom" id="tobot" title="Вниз" hidden><i class="ic ic-down"></i></button>
        <div class="composer-wrap">
            <div class="composer">
                <textarea id="ta" rows="1" placeholder="Написать сообщение…" enterkeyhint="${isTouch ? "enter" : "send"}"></textarea>
                <button class="act-btn find" id="selFind" title="Найти значение слова (выделите слово в переписке)"><i class="ic ic-search"></i></button>
                <button class="act-btn send" id="send" title="Отправить"><i class="ic ic-send"></i></button>
            </div>
            <div class="hint-line">Enter — отправить · Shift+Enter — новая строка · *действия* пишите в звёздочках</div>
        </div>
    </div>`;

    const msgsEl = $("#msgs"), inner = $("#inner"), ta = $("#ta"), sendBtn = $("#send");
    const nearBottom = () => msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 140;
    const toBottom = (force) => { if (force || nearBottom()) msgsEl.scrollTop = msgsEl.scrollHeight; };

    function drawPersona() {
        $("#pchip").innerHTML = `${avatarHTML(persona)}<span>${esc(persona?.name || "Вы")}</span>`;
    }
    function drawModelChip() {
        const e = S.engine, l = engineLabel(e);
        const name = e.status === "loading" ? `${Math.round((e.progress || 0) * 100)}% · ${shortModelName(e.modelName)}`
            : e.status === "ready" ? shortModelName(e.modelName)
            : e.status === "error" ? "Ошибка модели" : "Нет модели";
        $("#mchip").innerHTML = `<span class="dot ${l.cls}"></span><i class="ic ic-chip ic-sm"></i><span class="nm">${esc(name)}</span>`;
        $("#mchip").title = `ИИ-модель: ${e.modelName || "не загружена"} — нажмите, чтобы сменить`;
    }
    async function pickModel() {
        if (streaming) return toast("Дождитесь окончания ответа или остановите его", {error: true});
        let data;
        try { data = await api("GET", "/api/models"); } catch (e) { return toast(e.message, {error: true}); }
        const cur = S.engine.modelPath;
        const list = data.list.filter(m => m.exists);
        sheet("Модель для ответов", [
            ...list.map(m => {
                const active = m.path === cur && (S.engine.status === "ready" || S.engine.status === "loading");
                return {
                    on: active,
                    html: `<i class="ic ic-chip"></i><span class="grow" style="text-align:left;word-break:break-all">${esc(shortModelName(m.name))}<br><small class="muted">${fmtSize(m.size)}${active ? (S.engine.status === "loading" ? " · загружается" : " · активна") : ""}</small></span>`,
                    onClick: async () => {
                        if (active) return;
                        if (streaming) return toast("Дождитесь окончания ответа", {error: true});
                        try {
                            S.engine = await api("POST", "/api/models/load", {path: m.path});
                            S.engine.status = "loading"; S.engine.modelPath = m.path; S.engine.modelName = m.name; S.engine.progress = 0;
                            renderPill(); drawModelChip();
                            toast("Загружаю модель " + shortModelName(m.name) + "…");
                        } catch (e) { toast(e.message, {error: true}); }
                    }
                };
            }),
            ...(list.length ? [] : [{label: "Моделей пока нет", icon: "ic-x"}]),
            {label: "Управление моделями", icon: "ic-gear", onClick: () => location.hash = "#/model"}
        ]);
    }
    function lastUserIndex() {
        for (let i = chat.messages.length - 1; i >= 0; i--) if (chat.messages[i].role === "user") return i;
        return -1;
    }
    function msgHTML(m, i) {
        const isLast = i === chat.messages.length - 1;
        const isBot = m.role !== "user";
        const who = isBot ? bot : persona;
        const canRegen = isBot && isLast && lastUserIndex() >= 0 && lastUserIndex() < i;
        const n = m.swipes?.length || 1, si = (m.swipeIndex ?? 0);
        let tools = "";
        if (isBot && isLast && (n > 1 || canRegen)) {
            tools += `<span class="swiper"><button class="tb" data-a="prev" ${si === 0 ? "disabled" : ""}><i class="ic ic-back"></i></button><span>${si + 1}/${n}</span><button class="tb" data-a="next" ${si === n - 1 && !canRegen ? "disabled" : ""}><i class="ic ic-next"></i></button></span>`;
        }
        if (canRegen) tools += `<button class="tb" data-a="regen" title="Другой вариант ответа"><i class="ic ic-redo"></i></button>`;
        if (isBot && isLast) tools += `<button class="tb" data-a="cont" title="Продолжить ответ"><i class="ic ic-cont"></i></button>`;
        tools += `<button class="tb" data-a="copy" title="Копировать"><i class="ic ic-copy"></i></button>`;
        tools += `<button class="tb" data-a="edit" title="Изменить"><i class="ic ic-edit"></i></button>`;
        tools += `<button class="tb" data-a="del" title="Удалить"><i class="ic ic-trash"></i></button>`;
        return `<div class="msg ${isBot ? "bot" : "user"} ${isLast ? "last" : ""}" data-id="${m.id}">
            ${avatarHTML(who)}
            <div class="body"><div class="nm">${esc(who?.name || "")}</div>
            <div class="bubble">${(isBot ? fmtBot : fmt)(macros(currentText(m), bot, persona))}</div>
            <div class="tools">${tools}</div></div></div>`;
    }
    function render(scroll = false) {
        inner.innerHTML = chat.messages.map(msgHTML).join("") || `<div class="empty"><div class="big">✨</div>Напишите первое сообщение, чтобы начать историю.</div>`;
        if (streaming) attachStream();
        bindSwipe();
        if (scroll) toBottom(true);
    }
    // Ответ приходит целиком; пока он готовится — показываем, на каком он этапе и сколько прошло времени.
    const PHASES = {writing: "пишет ответ", checking: "проверяет ответ", sending: "отправляет"};
    function phaseLabel() {
        const sec = Math.max(0, Math.round((Date.now() - (streaming.startedAt || Date.now())) / 1000));
        const lim = Math.round((streaming.limitMs || (S.settings.replyTimeLimit || 60) * 1000) / 1000);
        return `${streaming.thinking ? "обдумывает" : (PHASES[streaming.phase] || PHASES.writing)}… <span class="ph-time">${sec} / ${lim} с</span>`;
    }
    function streamInnerHTML() {
        const ind = `<div class="thinking-label"><span class="typing"><i></i><i></i><i></i></span><span class="ph-label">${phaseLabel()}</span></div>`;
        if (streaming.prefix) return `<div>${fmtBot(macros(streaming.prefix, bot, persona))}</div>${ind}`;
        return ind;
    }
    let phaseTimer = null;
    function tickPhase() {
        clearInterval(phaseTimer);
        phaseTimer = setInterval(() => {
            if (!streaming || !alive) { clearInterval(phaseTimer); phaseTimer = null; return; }
            const l = streaming.el && $(".ph-label", streaming.el);
            if (l) l.innerHTML = phaseLabel();
        }, 1000);
    }
    function attachStream() {
        let el;
        if (streaming.targetId) {
            const msgEl = inner.querySelector(`[data-id="${streaming.targetId}"]`);
            el = msgEl && $(".bubble", msgEl);
            if (msgEl) { const t = $(".tools", msgEl); if (t) t.style.visibility = "hidden"; }
        }
        if (!el) {
            $(".empty", inner)?.remove();
            const wrap = document.createElement("div");
            wrap.className = "msg bot";
            wrap.innerHTML = `${avatarHTML(bot)}<div class="body"><div class="nm">${esc(bot.name)}</div><div class="bubble"></div></div>`;
            inner.appendChild(wrap);
            el = $(".bubble", wrap);
        }
        streaming.el = el;
        el.innerHTML = streamInnerHTML();
    }
    function updateStream() {
        if (!streaming?.el) return;
        const stick = nearBottom();
        streaming.el.innerHTML = streamInnerHTML();
        if (stick) toBottom(true);
    }
    function setBusy(b) {
        sendBtn.className = "act-btn " + (b ? "stop" : "send");
        sendBtn.innerHTML = `<i class="ic ${b ? "ic-stop" : "ic-send"}"></i>`;
        sendBtn.title = b ? "Остановить" : "Отправить";
        $("#whoSub").textContent = b ? "пишет ответ…" : (bot.tagline || "");
    }

    async function generate(body) {
        if (streaming) return false;
        if (S.engine.status !== "ready") {
            toast(S.engine.status === "loading" ? "Модель ещё загружается…" : "Сначала загрузите ИИ-модель", {error: true, link: S.engine.status === "loading" ? null : {href: "#/model", text: "Открыть"}});
            return false;
        }
        const target = body.mode === "regenerate" || body.mode === "continue" ? chat.messages[chat.messages.length - 1] : null;
        streaming = {mode: body.mode, targetId: target?.id || null, text: "", prefix: body.mode === "continue" ? currentText(target) : "", thinking: false, phase: "writing", startedAt: Date.now()};
        setBusy(true);
        tickPhase();
        let res;
        try {
            res = await fetch(`/api/chats/${id}/generate`, {method: "POST", headers: {"Content-Type": "application/json", ...authHeaders()}, body: JSON.stringify(body)});
        } catch (e) {
            streaming = null; setBusy(false); toast("Нет связи с компьютером", {error: true}); return false;
        }
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            streaming = null; setBusy(false); render();
            toast(d.error || "Ошибка", {error: true, link: res.status === 409 && /модель/i.test(d.error || "") ? {href: "#/model", text: "Модель"} : null});
            return false;
        }
        if (body.mode === "regenerate") {
            // показываем новый вариант на месте старого
            render();
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", finished = false, arrivedId = null;
        try {
            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                buf += dec.decode(value, {stream: true});
                let nl;
                while ((nl = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
                    if (!line) continue;
                    let ev; try { ev = JSON.parse(line); } catch { continue; }
                    if (!alive) continue;
                    if (ev.t === "start") {
                        if (ev.userMessages?.length) { chat.messages.push(...ev.userMessages); }
                        render(true);
                    } else if (ev.t === "thinking") { if (streaming) { streaming.thinking = true; updateStream(); } }
                    else if (ev.t === "phase") {
                        if (streaming) { streaming.phase = ev.phase; streaming.thinking = false; streaming.startedAt = ev.startedAt || streaming.startedAt; streaming.limitMs = ev.limitMs; updateStream(); }
                    }
                    else if (ev.t === "done") {
                        finished = true; chat = ev.chat; streaming = null; render();
                        arrivedId = ev.message?.id;
                        const el = inner.querySelector(`[data-id="${arrivedId}"]`);
                        if (el) { el.classList.add("arrived"); el.scrollIntoView({block: "start", behavior: "smooth"}); } else toBottom(true);
                        replyArrived(bot.name);
                    }
                    else if (ev.t === "error") { finished = true; streaming = null; toast(ev.error, {error: true}); }
                }
            }
        } catch (e) {
            // связь прервалась (например, телефон заблокирован) — ответ всё равно допишется на компьютере
        }
        if (!alive) return true;
        if (!finished) { startPolling(); }
        else {
            streaming = null; setBusy(false); render();
            if (arrivedId) inner.querySelector(`[data-id="${arrivedId}"]`)?.classList.add("arrived");
        }
        return true;
    }

    async function refresh() {
        const c = await api("GET", "/api/chats/" + id).catch(() => null);
        if (!c || !alive) return null;
        chat = c;
        if (c.pending) {
            const wasStreaming = !!streaming;
            streaming = {mode: c.pending.mode, targetId: c.pending.targetId, text: "", prefix: "", thinking: c.pending.thinking, phase: c.pending.phase, startedAt: c.pending.startedAt};
            if (!wasStreaming || !phaseTimer) tickPhase();
            if (c.pending.mode === "continue") {
                const t = chat.messages.find(m => m.id === c.pending.targetId);
                streaming.prefix = t ? currentText(t) : "";
            }
            setBusy(true);
        } else {
            const hadStreaming = !!streaming;
            streaming = null; setBusy(false);
            if (hadStreaming) { render(); toBottom(true); replyArrived(bot.name); return c; }
        }
        render();
        return c;
    }
    function startPolling() {
        clearTimeout(pollTimer);
        const tick = async () => {
            const c = await refresh();
            if (alive && (!c || c.pending)) pollTimer = setTimeout(tick, 800);
        };
        tick();
    }

    async function sendMessage() {
        if (streaming) { api("POST", "/api/stop").catch(() => {}); return; }
        const text = ta.value;
        const last = chat.messages[chat.messages.length - 1];
        if (!text.trim() && !(last && last.role === "user")) return;
        ta.value = ""; autosize();
        const ok = await generate({mode: "send", text});
        if (!ok && text) { ta.value = text; autosize(); }
    }
    function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; }

    async function setSwipe(m, idx) {
        m.swipeIndex = idx;
        render();
        chat = await api("PATCH", `/api/chats/${id}/messages/${m.id}`, {swipeIndex: idx});
    }

    function bindSwipe() {
        const lastEl = inner.querySelector(".msg.bot.last .bubble");
        if (!lastEl) return;
        let sx = 0, sy = 0;
        lastEl.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, {passive: true});
        lastEl.addEventListener("touchend", (e) => {
            const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
            const btn = inner.querySelector(`.msg.last [data-a="${dx < 0 ? "next" : "prev"}"]`);
            if (btn && !btn.disabled) btn.click();
        }, {passive: true});
    }

    inner.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-a]");
        const msgEl = e.target.closest(".msg");
        if (!btn) {
            if (isTouch && msgEl && !e.target.closest("textarea")) {
                $$(".msg.show-tools", inner).forEach(x => x !== msgEl && x.classList.remove("show-tools"));
                msgEl.classList.toggle("show-tools");
            }
            return;
        }
        if (streaming) return;
        const m = chat.messages.find(x => x.id === msgEl.dataset.id);
        if (!m) return;
        const a = btn.dataset.a;
        if (a === "prev") setSwipe(m, Math.max(0, (m.swipeIndex ?? 0) - 1));
        else if (a === "next") {
            const n = m.swipes?.length || 1;
            if ((m.swipeIndex ?? 0) < n - 1) setSwipe(m, (m.swipeIndex ?? 0) + 1);
            else generate({mode: "regenerate"});
        }
        else if (a === "regen") generate({mode: "regenerate"});
        else if (a === "cont") generate({mode: "continue"});
        else if (a === "copy") {
            const t = macros(currentText(m), bot, persona);
            try { await navigator.clipboard.writeText(t); toast("Скопировано"); }
            catch { const x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); toast("Скопировано"); }
        }
        else if (a === "edit") {
            const bubble = $(".bubble", msgEl);
            const tools = $(".tools", msgEl);
            tools.style.display = "none";
            bubble.innerHTML = `<textarea class="input edit-area">${esc(currentText(m))}</textarea>
                <div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px"><button class="btn sm" data-ec>Отмена</button><button class="btn sm primary" data-es>Сохранить</button></div>`;
            const area = $("textarea", bubble);
            area.style.height = Math.min(area.scrollHeight + 4, 420) + "px";
            area.focus();
            $("[data-ec]", bubble).onclick = (ev) => { ev.stopPropagation(); render(); };
            $("[data-es]", bubble).onclick = async (ev) => {
                ev.stopPropagation();
                chat = await api("PATCH", `/api/chats/${id}/messages/${m.id}`, {text: area.value});
                render();
            };
        }
        else if (a === "del") {
            const idx = chat.messages.indexOf(m);
            const hasAfter = idx < chat.messages.length - 1;
            sheet("Удалить сообщение?", [
                {label: "Удалить только это сообщение", icon: "ic-trash", danger: true, onClick: async () => { chat = await api("DELETE", `/api/chats/${id}/messages/${m.id}`); render(); }},
                ...(hasAfter ? [{label: "Удалить это и все следующие", icon: "ic-trash", danger: true, onClick: async () => { chat = await api("DELETE", `/api/chats/${id}/messages/${m.id}?after=1`); render(); }}] : []),
                {label: "Отмена", icon: "ic-x"}
            ]);
        }
    });

    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !isTouch && !e.isComposing) { e.preventDefault(); sendMessage(); }
    });
    sendBtn.onclick = sendMessage;
    $("#back").onclick = () => history.length > 1 ? history.back() : (location.hash = "#/");
    $("#who").onclick = () => location.hash = "#/bot/" + bot.id;
    $("#pchip").onclick = () => sheet("Кем вы играете?", [
        ...S.personas.map(p => ({html: `${avatarHTML(p, "sm")}<span class="grow">${esc(p.name)}</span>`, on: p.id === persona?.id, onClick: async () => {
            chat = await api("PATCH", "/api/chats/" + id, {personaId: p.id});
            persona = p; drawPersona(); render();
        }})),
        {label: "Управление персонами", icon: "ic-user", onClick: () => location.hash = "#/personas"}
    ]);
    $("#mchip").onclick = pickModel;
    engineListeners.add(() => drawModelChip());
    $("#csettings").onclick = () => openChatSettings(chat, (c) => { chat = c; });
    msgsEl.addEventListener("scroll", () => { $("#tobot").hidden = nearBottom(); }, {passive: true});
    $("#tobot").onclick = () => { msgsEl.scrollTo({top: msgsEl.scrollHeight, behavior: "smooth"}); };
    // изменения с другого устройства (например, сообщение отправлено с телефона)
    syncListeners.add(({chatChanged}) => {
        if (!chatChanged || streaming || inner.querySelector(".edit-area")) return;
        refresh().then(c => { if (c?.pending) startPolling(); });
    });
    $("#menu").onclick = () => sheet(bot.name, [
        {label: "Сменить модель", icon: "ic-chip", onClick: pickModel},
        {label: "Найти значение слова", icon: "ic-search", onClick: () => openLookup(selText, {botId: null})},
        {label: "Словарь", icon: "ic-quote", onClick: () => location.hash = "#/lore"},
        {label: "Настройки чата", icon: "ic-sliders", onClick: () => openChatSettings(chat, (c) => { chat = c; })},
        {label: "Синхронизировать", icon: "ic-sync", onClick: () => syncNow()},
        {label: "Новый чат", icon: "ic-plus", onClick: async () => { const c = await api("POST", "/api/chats", {botId: bot.id, personaId: persona?.id}); location.hash = "#/chat/" + c.id; }},
        {label: "Профиль персонажа", icon: "ic-user", onClick: () => location.hash = "#/bot/" + bot.id},
        {label: "Изменить персонажа", icon: "ic-edit", onClick: () => location.hash = `#/bot/${bot.id}/edit`},
        {label: "Удалить этот чат", icon: "ic-trash", danger: true, onClick: async () => {
            if (!await confirmBox("Удалить чат?", "История переписки будет удалена.")) return;
            await api("DELETE", "/api/chats/" + id); location.hash = "#/bot/" + bot.id;
        }}
    ]);

    // кнопка 🔍 в поле ввода: если в переписке выделено слово — ищем его (кнопка подсвечивается), иначе открываем пустой поиск
    let selText = "", selAt = 0;
    const selBtn = $("#selFind");
    const onSel = () => {
        const s = document.getSelection();
        const t = (s?.toString() || "").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        const inside = s && s.anchorNode && inner.contains(s.anchorNode);
        if (inside && t && t.length <= 60 && t.split(" ").length <= 5) {
            selText = t; selAt = Date.now();
            selBtn.classList.add("has-sel");
            selBtn.title = `Найти «${t}»`;
        } else if (Date.now() - selAt > 1500) {
            // iOS снимает выделение при касании кнопки — поэтому помним слово ещё полторы секунды
            selText = ""; selBtn.classList.remove("has-sel");
            selBtn.title = "Найти значение слова (выделите слово в переписке)";
        }
    };
    document.addEventListener("selectionchange", onSel);
    selBtn.addEventListener("pointerdown", (e) => e.preventDefault()); // не сбрасывать выделение и не закрывать клавиатуру
    selBtn.onclick = () => {
        const t = selText;
        selText = ""; selBtn.classList.remove("has-sel");
        document.getSelection()?.removeAllRanges();
        openLookup(t, {botId: null});
    };

    const onVis = () => { if (document.visibilityState === "visible" && alive) startPolling(); };
    document.addEventListener("visibilitychange", onVis);
    const onRerender = () => { if (!streaming && !inner.querySelector(".edit-area")) render(); };
    document.addEventListener("lumina:rerender", onRerender);
    pageCleanup = () => { alive = false; clearTimeout(pollTimer); clearInterval(phaseTimer); document.removeEventListener("selectionchange", onSel); document.removeEventListener("visibilitychange", onVis); document.removeEventListener("lumina:rerender", onRerender); };

    drawPersona();
    drawModelChip();
    if (chat.pending) { startPolling(); }
    render(true);
    requestAnimationFrame(() => toBottom(true));
    if (!isTouch) ta.focus();
}

/* ================= настройки чата ================= */
function presetOptions(map, cur, {inherit = null} = {}) {
    const o = [];
    if (inherit) o.push(`<option value="" ${!cur ? "selected" : ""}>${esc(inherit)}</option>`);
    for (const [k, v] of Object.entries(map)) o.push(`<option value="${k}" ${cur === k ? "selected" : ""}>${esc(v.label)}</option>`);
    return o.join("");
}
function appearanceHTML() {
    const p = getPrefs();
    return `<div class="slider-row"><div class="top"><b>Размер шрифта сообщений</b><output id="o_fs">${p.fontSize}px</output></div>
            <input type="range" id="pf_fs" min="13" max="26" step="1" value="${p.fontSize}">
            <div class="fs-preview bubble-like" id="fsPrev">— Пример текста, — сказала она, улыбнувшись.</div></div>
        <div class="set-row"><div class="t"><b>Шрифт</b><span>Книжный шрифт с засечками удобнее для длинных ответов.</span></div>
            <select class="input" style="width:170px" id="pf_ff"><option value="sans" ${p.fontFamily === "sans" ? "selected" : ""}>Обычный</option><option value="serif" ${p.fontFamily === "serif" ? "selected" : ""}>Книжный</option></select></div>
        <div class="set-row"><div class="t"><b>Фон чата</b><span>Фото персонажа из его карточки.</span></div>
            <select class="input" style="width:170px" id="pf_bg"><option value="sharp" ${p.bgMode === "sharp" ? "selected" : ""}>Фото персонажа</option><option value="blur" ${p.bgMode === "blur" ? "selected" : ""}>Размытое фото</option><option value="off" ${p.bgMode === "off" ? "selected" : ""}>Без фона</option></select></div>
        <div class="set-row"><div class="t"><b>Ответы бота блоками</b><span>Действия, реплики и мысли — отдельными блоками.</span></div>
            <label class="switch"><input type="checkbox" id="pf_blocks" ${p.blocks ? "checked" : ""}><span></span></label></div>
        <div class="set-row"><div class="t"><b>Иконки у блоков</b><span>✋ действие · ❝ реплика · ☁ мысли</span></div>
            <label class="switch"><input type="checkbox" id="pf_bicons" ${p.blockIcons ? "checked" : ""}><span></span></label></div>
        <div class="slider-row"><div class="top"><b>Затемнение фона</b><output id="o_dim">${Math.round(p.bgDim * 100)}%</output></div>
            <input type="range" id="pf_dim" min="0" max="0.9" step="0.05" value="${p.bgDim}"></div>
        <div class="hint small muted" style="margin-top:8px">Эти настройки сохраняются отдельно на каждом устройстве (ПК и телефон).</div>`;
}
function bindAppearance(root) {
    const fs = $("#pf_fs", root);
    if (!fs) return;
    fs.oninput = () => { setPref("fontSize", +fs.value); $("#o_fs", root).textContent = fs.value + "px"; };
    $("#pf_ff", root).onchange = (e) => setPref("fontFamily", e.target.value);
    $("#pf_bg", root).onchange = (e) => setPref("bgMode", e.target.value);
    const rerenderChat = () => { if ((location.hash || "").startsWith("#/chat/")) document.dispatchEvent(new Event("lumina:rerender")); };
    $("#pf_blocks", root).onchange = (e) => { setPref("blocks", e.target.checked); rerenderChat(); };
    $("#pf_bicons", root).onchange = (e) => { setPref("blockIcons", e.target.checked); rerenderChat(); };
    $("#pf_dim", root).oninput =(e) => { setPref("bgDim", +e.target.value); $("#o_dim", root).textContent = Math.round(e.target.value * 100) + "%"; };
}
function memLabel(n) { return !n ? "вся переписка" : `последние ${n} сообщ.`; }
function openChatSettings(chat, onSaved) {
    const pr = S.settings.presets || {lengths: {}, styles: {}, notesLimit: 1500};
    const cs = chat.settings || {};
    const limit = pr.notesLimit || 1500;
    const styles = allStyles();
    const gStyle = styles[S.settings.style]?.label;
    const memOpts = [0, 10, 20, 30, 50, 80, 120, 200];
    modal(`<h3>Настройки чата</h3>
        <div class="muted small" style="margin-bottom:16px">Действуют только для этого чата. Остальное — в разделе «Настройки».</div>
        <div class="field"><label>Контекст чата <span class="muted small" id="ncount"></span></label>
            <div class="hint">Важные факты, которые бот должен помнить всегда, даже если старые сообщения уже не помещаются в его память: кто есть кто, что произошло, где вы сейчас.</div>
            <textarea class="input" id="cs_notes" rows="7" maxlength="${limit}" placeholder="Например: Лира и Путник вместе ищут пропавшего брата Лиры. Вчера они сбежали из замка барона…">${esc(cs.notes || "")}</textarea>
            <div class="row" style="justify-content:flex-end"><button class="btn sm" id="cs_sum"><i class="ic ic-spark ic-sm"></i>Составить из переписки</button></div></div>
        <div class="set-row"><div class="t"><b>Память бота</b><span>Сколько последних сообщений бот перечитывает перед ответом.</span></div>
            <select class="input" style="width:190px" id="cs_mem">
                <option value="" ${cs.memoryMessages == null ? "selected" : ""}>Как в настройках (${memLabel(S.settings.memoryMessages)})</option>
                ${memOpts.map(n => `<option value="${n}" ${cs.memoryMessages === n ? "selected" : ""}>${memLabel(n)}</option>`).join("")}</select></div>
        <div class="set-row"><div class="t"><b>Стиль ответов</b></div>
            <select class="input" style="width:190px" id="cs_style">${presetOptions(styles, cs.style, {inherit: `Как в настройках (${gStyle || "—"})`})}</select></div>
        <div class="set-row"><div class="t"><b>Длина ответов</b></div>
            <select class="input" style="width:190px" id="cs_len">${presetOptions(pr.lengths, cs.length, {inherit: `Как в настройках (${pr.lengths[S.settings.responseLength]?.label || "—"})`})}</select></div>
        <h3 style="margin-top:22px;font-size:16px">Внешний вид</h3>
        ${appearanceHTML()}
        <div class="btns"><button class="btn" id="cs_x">Закрыть</button><button class="btn primary" id="cs_ok">Сохранить</button></div>`, {
        wide: true,
        onMount: (m) => {
            const ta = $("#cs_notes", m.el);
            const count = () => { $("#ncount", m.el).textContent = `${ta.value.length} / ${limit}`; };
            ta.oninput = count; count();
            bindAppearance(m.el);
            $("#cs_x", m.el).onclick = m.close;
            $("#cs_sum", m.el).onclick = async (e) => {
                const b = e.currentTarget;
                b.disabled = true; b.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>Составляю…`;
                try {
                    const r = await api("POST", `/api/chats/${chat.id}/summarize`);
                    ta.value = r.notes.slice(0, limit); count();
                    toast("Сводка готова — проверьте и сохраните");
                } catch (err) { toast(err.message, {error: true}); }
                b.disabled = false; b.innerHTML = `<i class="ic ic-spark ic-sm"></i>Составить из переписки`;
            };
            $("#cs_ok", m.el).onclick = async () => {
                const mem = $("#cs_mem", m.el).value;
                try {
                    const c = await api("PATCH", "/api/chats/" + chat.id, {settings: {
                        notes: ta.value,
                        memoryMessages: mem === "" ? null : +mem,
                        style: $("#cs_style", m.el).value || null,
                        length: $("#cs_len", m.el).value || null
                    }});
                    onSaved?.(c);
                    m.close(); toast("Настройки чата сохранены");
                } catch (err) { toast(err.message, {error: true}); }
            };
        }
    });
}

/* ================= страница: персоны ================= */
/* ================= словарь (лорбук) и поиск терминов ================= */
let LORE = null;
async function loadLore(force = false) {
    if (!LORE || force) LORE = await api("GET", "/api/lore");
    return LORE;
}
function loreScopeOptions(cur) {
    return `<option value="" ${!cur ? "selected" : ""}>Все персонажи</option>` +
        S.bots.map(b => `<option value="${b.id}" ${cur === b.id ? "selected" : ""}>Только: ${esc(b.name)}</option>`).join("");
}
/** Редактор записи словаря. entry — существующая запись или заготовка {keys, content, botId, source}. */
function openLoreEditor(entry, onSaved) {
    const isNew = !entry?.id;
    const f = {keys: [], content: "", botId: null, enabled: true, always: false, source: null, ...(entry || {})};
    modal(`<h3>${isNew ? "Новый термин" : "Термин словаря"}</h3>
        <div class="field"><label>Слова-ключи</label><div class="hint">Через запятую. Когда любое из них встретится в последних сообщениях, бот получит объяснение. Можно писать начало слова: «академи» найдёт «академия», «академии».</div>
            <input class="input" id="le_k" value="${esc(f.keys.join(", "))}" placeholder="кринж, кринжово"></div>
        <div class="field"><label>Значение</label><div class="hint">Коротко и по делу: что значит и как употребляется.</div>
            <textarea class="input" id="le_c" rows="5" maxlength="1500" placeholder="Сленг: чувство неловкости, «испанский стыд» за чьи-то действия.">${esc(f.content)}</textarea>
            ${f.source ? `<div class="hint" style="margin-top:6px">Источник: <a href="${esc(f.source)}" target="_blank" style="color:var(--a1);word-break:break-all">${esc(f.source)}</a></div>` : ""}</div>
        <div class="field"><label>Для кого</label><select class="input" id="le_b">${loreScopeOptions(f.botId)}</select></div>
        <div class="set-row"><div class="t"><b>Всегда помнить</b><span>Подставлять всегда, даже если слово не упоминалось (для важных фактов о мире).</span></div>
            <label class="switch"><input type="checkbox" id="le_a" ${f.always ? "checked" : ""}><span></span></label></div>
        <div class="set-row"><div class="t"><b>Включено</b></div>
            <label class="switch"><input type="checkbox" id="le_e" ${f.enabled !== false ? "checked" : ""}><span></span></label></div>
        <div class="btns">${!isNew ? `<button class="btn danger" id="le_d" style="margin-right:auto">Удалить</button>` : ""}<button class="btn" id="le_x">Отмена</button><button class="btn primary" id="le_s">Сохранить</button></div>`, {
        wide: true,
        onMount: (m) => {
            $("#le_x", m.el).onclick = m.close;
            if ($("#le_d", m.el)) $("#le_d", m.el).onclick = async () => {
                if (!await confirmBox("Удалить термин?", `«${f.keys[0]}» будет удалён из словаря.`)) return;
                await api("DELETE", "/api/lore/" + f.id); LORE = LORE?.filter(x => x.id !== f.id);
                m.close(); onSaved?.(null); toast("Удалено");
            };
            $("#le_s", m.el).onclick = async () => {
                const body = {keys: $("#le_k", m.el).value.split(",").map(s => s.trim()).filter(Boolean), content: $("#le_c", m.el).value,
                    botId: $("#le_b", m.el).value || null, always: $("#le_a", m.el).checked, enabled: $("#le_e", m.el).checked, source: f.source};
                if (!body.keys.length) return toast("Укажите хотя бы одно слово-ключ", {error: true});
                if (!body.content.trim()) return toast("Напишите значение", {error: true});
                try {
                    const saved = isNew ? await api("POST", "/api/lore", body) : await api("PUT", "/api/lore/" + f.id, body);
                    if (LORE) LORE = isNew ? [saved, ...LORE] : LORE.map(x => x.id === saved.id ? saved : x);
                    m.close(); onSaved?.(saved); toast(isNew ? "Добавлено в словарь — бот будет это учитывать" : "Сохранено");
                } catch (e) { toast(e.message, {error: true}); }
            };
        }
    });
}
/** Поиск значения термина в интернете (только по нажатию; уходит только сам термин). */
function openLookup(term = "", {botId = null, onSaved} = {}) {
    modal(`<h3>Найти значение</h3>
        <div class="muted small" style="margin-bottom:10px">Ищет в Викисловаре, Википедии и DuckDuckGo. В интернет отправляется только это слово — не ваш чат.</div>
        <form class="row" id="lk_f" style="gap:8px"><input class="input grow" id="lk_q" value="${esc(term)}" placeholder="Слово или выражение" autocomplete="off" enterkeyhint="search">
            <button class="btn primary" id="lk_go"><i class="ic ic-search ic-sm"></i>Найти</button></form>
        <div id="lk_r" style="margin-top:14px"></div>
        <div class="btns"><button class="btn" id="lk_manual"><i class="ic ic-plus ic-sm"></i>Добавить вручную</button><button class="btn" id="lk_x">Закрыть</button></div>`, {
        wide: true,
        onMount: (m) => {
            const box = $("#lk_r", m.el);
            // ключ — общая основа запроса и заголовка статьи («лютню» + «Лютня» → «лютн»), чтобы ловить все формы слова
            const keyFor = (q, title) => {
                const a = q.toLowerCase(), b = String(title || "").toLowerCase();
                let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
                return i >= 4 ? a.slice(0, i) : a;
            };
            const save = (q, r, content) => { m.close(); openLoreEditor({keys: q ? [keyFor(q, r?.title)] : [], content, botId, source: r?.url || null}, onSaved); };
            const search = async () => {
                const q = $("#lk_q", m.el).value.trim();
                if (!q) return;
                box.innerHTML = `<div class="thinking-label"><span class="typing"><i></i><i></i><i></i></span>ищу «${esc(q)}»…</div>`;
                let d;
                try { d = await api("POST", "/api/lookup", {q}); }
                catch (e) { box.innerHTML = `<div class="banner">${esc(e.message)}</div>`; return; }
                if (!d.results.length) { box.innerHTML = `<div class="empty" style="padding:18px">Ничего не нашлось. Попробуйте начальную форму слова или добавьте значение вручную.</div>`; return; }
                box.innerHTML = d.results.map((r, i) => `<div class="card lk-res" style="margin-bottom:10px">
                    <div class="row" style="gap:8px;margin-bottom:6px"><span class="badge dim">${esc(r.source)}</span><b class="grow">${esc(r.title)}</b>
                        <a href="${esc(r.url)}" target="_blank" class="small muted">открыть</a></div>
                    <div class="small" style="line-height:1.55">${esc(r.text)}</div>
                    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap">
                        <button class="btn sm" data-short="${i}" title="Локальная модель перескажет справку в 1–2 предложениях"><i class="ic ic-spark ic-sm"></i>Кратко (моделью)</button>
                        <button class="btn sm primary" data-save="${i}"><i class="ic ic-plus ic-sm"></i>В словарь</button></div></div>`).join("");
                $$("[data-save]", box).forEach(b => b.onclick = () => { const r = d.results[+b.dataset.save]; save(q, r, r.text); });
                $$("[data-short]", box).forEach(b => b.onclick = async () => {
                    const r = d.results[+b.dataset.short];
                    b.disabled = true; b.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
                    try { const c = await api("POST", "/api/lookup/condense", {term: q, text: r.text}); save(q, r, c.text || r.text); }
                    catch (e) { toast(e.message, {error: true}); b.disabled = false; b.innerHTML = `<i class="ic ic-spark ic-sm"></i>Кратко (моделью)`; }
                });
            };
            $("#lk_f", m.el).onsubmit = (e) => { e.preventDefault(); search(); };
            $("#lk_x", m.el).onclick = m.close;
            $("#lk_manual", m.el).onclick = () => save($("#lk_q", m.el).value.trim() || "", null, "");
            if (term) search(); else setTimeout(() => $("#lk_q", m.el).focus(), 50);
        }
    });
}
async function pageLore() {
    const list = await loadLore(true);
    view.innerHTML = `<div class="page narrow">
        <div class="page-head"><h1>Словарь</h1>
            <div class="sub">Сленг, термины, факты о мире. Когда слово встречается в переписке, бот незаметно получает его значение и использует правильно. Работает без интернета.</div></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:16px"><button class="btn primary" id="ladd"><i class="ic ic-plus"></i>Добавить</button><button class="btn" id="lfind"><i class="ic ic-search"></i>Найти в интернете</button></div>
        ${list.length > 5 ? `<div class="search" style="margin-bottom:12px"><i class="ic ic-search"></i><input class="input" id="lq" placeholder="Поиск по словарю" autocomplete="off"></div>` : ""}
        <div class="list" id="llist"></div>
    </div>`;
    const draw = () => {
        const q = ($("#lq")?.value || "").trim().toLowerCase();
        const items = LORE.filter(e => !q || e.keys.join(" ").toLowerCase().includes(q) || e.content.toLowerCase().includes(q));
        $("#llist").innerHTML = items.length ? items.map(e => {
            const bot = e.botId && S.bots.find(b => b.id === e.botId);
            return `<div class="li lore-li ${e.enabled === false ? "off" : ""}" data-l="${e.id}"><i class="ic ic-quote"></i>
                <div class="t"><b>${esc(e.keys.join(", "))} ${bot ? `<span class="badge dim" style="margin-left:6px">${esc(bot.name)}</span>` : ""}${e.always ? `<span class="badge" style="margin-left:6px">всегда</span>` : ""}${e.enabled === false ? `<span class="badge warn" style="margin-left:6px">выкл</span>` : ""}</b>
                <span>${esc(e.content)}</span></div></div>`;
        }).join("") : `<div class="empty" style="padding:26px">${LORE.length ? "Ничего не найдено." : "Словарь пока пуст. Добавьте термин вручную или найдите его значение в интернете.<br><br>Подсказка: в чате выделите непонятное слово — появится кнопка «Найти»."}</div>`;
        $$("[data-l]").forEach(el => el.onclick = () => openLoreEditor(LORE.find(x => x.id === el.dataset.l), draw));
    };
    $("#ladd").onclick = () => openLoreEditor(null, draw);
    $("#lfind").onclick = () => openLookup("", {onSaved: draw});
    if ($("#lq")) $("#lq").oninput = draw;
    draw();
}

function pagePersonas() {
    view.innerHTML = `<div class="page narrow">
        <div class="page-head"><h1>Мои персоны</h1><button class="btn primary" id="add"><i class="ic ic-plus"></i>Новая персона</button>
        <div class="sub">Персона — это тот, кем играете вы: имя, внешность, характер. Персонажи будут обращаться к вам так и учитывать описание.</div></div>
        <div class="list" id="plist"></div>
    </div>`;
    const draw = () => {
        $("#plist").innerHTML = S.personas.map(p => `<div class="li" data-p="${p.id}">${avatarHTML(p, "lg")}
            <div class="t"><b>${esc(p.name)} ${p.id === S.settings.defaultPersonaId ? `<span class="badge" style="margin-left:6px">по умолчанию</span>` : ""}</b>
            <span>${esc(p.description || "Без описания")}</span></div>
            ${p.id !== S.settings.defaultPersonaId ? `<button class="btn sm ghost icon" data-def="${p.id}" title="Сделать по умолчанию"><i class="ic ic-star ic-sm"></i></button>` : ""}
            </div>`).join("");
        $$("[data-p]").forEach(el => el.onclick = (e) => { if (!e.target.closest("[data-def]")) editPersona(S.personas.find(p => p.id === el.dataset.p)); });
        $$("[data-def]").forEach(b => b.onclick = async () => {
            const r = await api("PUT", "/api/settings", {defaultPersonaId: b.dataset.def});
            S.settings = r.settings; draw();
        });
    };
    function editPersona(p) {
        const f = p ? {...p} : {name: "", avatar: null, description: ""};
        modal(`<h3>${p ? "Персона" : "Новая персона"}</h3>
            <div class="row" style="margin:16px 0 18px;gap:16px">
                <div class="avatar-pick" id="pav" style="width:96px;aspect-ratio:1;border-radius:50%">${f.avatar ? `<img src="${f.avatar}">` : `<i class="ic ic-upload"></i>`}</div>
                <div class="grow small muted">Нажмите на круг, чтобы выбрать аватар.</div>
            </div>
            <div class="field"><label>Имя</label><input class="input" id="pn" value="${esc(f.name)}" placeholder="Как к вам обращаться"></div>
            <div class="field"><label>Описание</label><div class="hint">Внешность, возраст, характер, кем вы приходитесь персонажам.</div>
                <textarea class="input" id="pd" rows="5" placeholder="Высокий темноволосый наёмник с шрамом через бровь…">${esc(f.description)}</textarea></div>
            <div class="btns">${p ? `<button class="btn danger" id="pdel" style="margin-right:auto">Удалить</button>` : ""}<button class="btn" id="pc">Отмена</button><button class="btn primary" id="ps">Сохранить</button></div>`, {
            onMount: (m) => {
                $("#pav", m.el).onclick = async () => {
                    const file = await pickFile("image/*"); if (!file) return;
                    f.avatar = await imageToDataURL(file, 384);
                    $("#pav", m.el).innerHTML = `<img src="${f.avatar}">`;
                };
                $("#pc", m.el).onclick = m.close;
                $("#ps", m.el).onclick = async () => {
                    f.name = $("#pn", m.el).value; f.description = $("#pd", m.el).value;
                    if (!f.name.trim()) return toast("Введите имя", {error: true});
                    const saved = p ? await api("PUT", "/api/personas/" + p.id, f) : await api("POST", "/api/personas", f);
                    if (p) S.personas = S.personas.map(x => x.id === p.id ? saved : x); else S.personas.push(saved);
                    m.close(); draw();
                };
                if ($("#pdel", m.el)) $("#pdel", m.el).onclick = async () => {
                    m.close();
                    if (!await confirmBox("Удалить персону?", `«${p.name}» будет удалена.`)) return;
                    try {
                        await api("DELETE", "/api/personas/" + p.id);
                        S.personas = S.personas.filter(x => x.id !== p.id);
                        const st = await api("GET", "/api/state"); S.settings = st.settings;
                        draw();
                    } catch (e) { toast(e.message, {error: true}); }
                };
            }
        });
    }
    $("#add").onclick = () => editPersona(null);
    draw();
}

/* ================= страница: модель ================= */
async function pageModel() {
    let data = await api("GET", "/api/models");
    view.innerHTML = `<div class="page narrow">
        <div class="page-head"><h1>ИИ-модель</h1><div class="sub">Нейросеть работает прямо на вашем компьютере — без интернета и без внешней модерации.</div></div>
        <div class="card" id="status"></div>
        <h2>Ваши модели</h2>
        ${D ? `<div class="drop" id="drop"><i class="ic ic-upload" style="width:28px;height:28px"></i>
                <div style="margin:8px 0 14px">Перетащите сюда файл <b>.gguf</b> или</div>
                <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" id="pick"><i class="ic ic-plus"></i>Выбрать файл модели</button>
                <button class="btn" id="opendir"><i class="ic ic-folder"></i>Папка моделей</button></div></div>`
             : `<div class="banner"><i class="ic ic-phone"></i><div class="small">Добавлять новые файлы моделей можно на компьютере. Здесь можно переключиться между уже добавленными.</div></div>`}
        <div class="list" id="mlist" style="margin-top:14px"></div>
        <h2>Где взять модель</h2>
        <div class="card help">
            <ol>
                <li>Откройте <a href="https://huggingface.co/models?library=gguf&sort=trending" target="_blank" style="color:var(--a1)">Hugging Face → модели GGUF</a>.</li>
                <li>Ищите по словам <code>roleplay</code>, <code>RP</code>, <code>uncensored</code> или <code>abliterated</code> — это версии, дообученные для ролевых игр или со снятыми встроенными отказами.</li>
                <li>Откройте вкладку <b>Files</b> и скачайте один файл <code>.gguf</code> с пометкой <code>Q4_K_M</code> — лучший баланс качества и размера. <code>Q5_K_M</code>/<code>Q6_K</code> — качественнее, но тяжелее.</li>
                <li>Добавьте файл сюда кнопкой выше или положите в «Папку моделей».</li>
            </ol>
            <table class="vram"><tr><th>Видеопамять (VRAM)</th><th>Размер модели</th><th>Файл Q4_K_M</th></tr>
                <tr><td>6–8 ГБ</td><td>7–9B</td><td>≈ 4–5,5 ГБ</td></tr>
                <tr><td>10–12 ГБ</td><td>12–14B</td><td>≈ 7–9 ГБ</td></tr>
                <tr><td>16 ГБ</td><td>20–24B</td><td>≈ 12–14 ГБ</td></tr>
                <tr><td>24 ГБ+</td><td>27–35B</td><td>≈ 16–20 ГБ</td></tr></table>
            <div class="small muted">Если модель больше видеопамяти, часть её уйдёт в оперативную память — будет работать, но медленнее. Для русского языка лучше подходят модели на базе Qwen, Gemma, Mistral Nemo/Small.</div>
        </div>
    </div>`;

    const drawStatus = () => {
        const e = S.engine, l = engineLabel(e);
        const gpuName = {vulkan: "Видеокарта (Vulkan)", cuda: "Видеокарта NVIDIA (CUDA)", metal: "Apple Metal", cpu: "Процессор", mock: "Тестовый режим"}[e.gpu] || e.gpu || "—";
        $("#status").innerHTML = `<div class="status-card">
            <div class="orb ${l.cls}"><i class="ic ic-chip"></i></div>
            <div class="grow">
                <div class="row" style="gap:8px;flex-wrap:wrap"><b style="font-size:17px">${esc(l.title)}</b>
                ${e.status === "ready" ? `<span class="badge dim">${esc(gpuName)}</span>${e.contextSize ? `<span class="badge dim">контекст ${e.contextSize}</span>` : ""}` : ""}</div>
                <div class="muted small" style="word-break:break-all">${esc(e.status === "error" ? e.error : (e.modelName || "Выберите модель из списка ниже"))}</div>
                ${e.status === "loading" ? `<div class="progress"><i style="width:${Math.round((e.progress || 0) * 100)}%"></i></div>` : ""}
            </div>
            ${e.status === "ready" || e.status === "loading" ? `<button class="btn sm" id="unload">Выгрузить</button>` : ""}
        </div>`;
        if ($("#unload")) $("#unload").onclick = async () => { S.engine = await api("POST", "/api/models/unload"); renderPill(); drawStatus(); drawList(); };
    };
    const drawList = () => {
        const cur = S.engine.modelPath;
        $("#mlist").innerHTML = data.list.length ? data.list.map(m => `<div class="li model-li ${m.path === cur && S.engine.status === "ready" ? "current" : ""}" data-path="${esc(m.path)}">
            <i class="ic ic-chip"></i>
            <div class="t"><b style="word-break:break-all;white-space:normal">${esc(m.name)}</b><span>${m.exists ? fmtSize(m.size) : "файл не найден"} · ${esc(m.path)}</span></div>
            ${m.path === cur && S.engine.status === "ready" ? `<span class="badge">активна</span>` :
              m.path === cur && S.engine.status === "loading" ? `<span class="badge warn">загрузка</span>` :
              `<button class="btn sm primary" data-load ${!m.exists ? "disabled" : ""}>Загрузить</button>`}
            ${D ? `<button class="btn sm ghost icon" data-rm title="Убрать из списка"><i class="ic ic-x ic-sm"></i></button>` : ""}
        </div>`).join("") : `<div class="empty" style="padding:26px">Пока нет ни одной модели.</div>`;
        $$("[data-load]").forEach(b => b.onclick = async () => {
            const p = b.closest("[data-path]").dataset.path;
            S.engine = await api("POST", "/api/models/load", {path: p});
            S.engine.status = "loading"; S.engine.modelPath = p;
            renderPill(); drawStatus(); drawList();
        });
        $$("[data-rm]").forEach(b => b.onclick = async () => {
            const p = b.closest("[data-path]").dataset.path;
            const inDir = p.startsWith(data.dir);
            if (inDir) { toast("Этот файл лежит в папке моделей — удалите его оттуда", {ms: 5000}); return; }
            data = {...data, ...(await api("POST", "/api/models/remove", {path: p}))};
            drawList();
        });
    };
    async function addPath(p) {
        if (!p) return;
        if (!p.toLowerCase().endsWith(".gguf")) return toast("Нужен файл с расширением .gguf", {error: true});
        try {
            data = {...data, ...(await api("POST", "/api/models/add", {path: p}))};
            drawList();
            if (S.engine.status !== "ready" && S.engine.status !== "loading") {
                S.engine = await api("POST", "/api/models/load", {path: p});
                S.engine.status = "loading"; S.engine.modelPath = p;
                renderPill(); drawStatus(); drawList();
            } else toast("Модель добавлена");
        } catch (e) { toast(e.message, {error: true}); }
    }
    if (D) {
        $("#pick").onclick = async () => addPath(await D.pickModel());
        $("#opendir").onclick = () => D.openPath(data.dir);
        const drop = $("#drop");
        ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
        ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
        drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) addPath(D.pathForFile(f)); });
    }
    drawStatus(); drawList();
    engineListeners.add(async () => {
        drawStatus();
        data = await api("GET", "/api/models").catch(() => data);
        drawList();
    });
}

/* ================= страница: настройки ================= */
async function pageSettings() {
    const s = S.settings;
    const pr = s.presets || {lengths: {}, styles: {}};
    const FMT = {memoryMessages: (v) => +v ? `${v} сообщ.` : "вся переписка", contextSize: (v) => `${v} токенов`, minChars: (v) => `${v} симв.`,
        replyTimeLimit: (v) => v < 60 ? `${v} с` : `${Math.floor(v / 60)} мин${v % 60 ? ` ${v % 60} с` : ""}`};
    const fmtv = (k, v) => FMT[k] ? FMT[k](v) : v;
    const slider = (key, label, min, max, step, hint) => `<div class="slider-row"><div class="top"><b>${label}</b><output id="o_${key}">${fmtv(key, s[key])}</output></div>
        <input type="range" data-s="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}">${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
    const styles = allStyles();
    view.innerHTML = `<div class="page narrow">
        <div class="page-head"><h1>Настройки</h1></div>
        ${S.local ? `<h2 style="margin-top:0">📱 Играть с телефона</h2><div class="card" id="lan"></div>`
                  : `<div class="card"><div class="set-row" style="padding-top:0"><div class="t"><b>Вы подключены к компьютеру по Wi‑Fi</b><span>Персонажи и чаты хранятся на компьютере и синхронизируются автоматически. Совет: в Safari «Поделиться» → «На экран Домой».</span></div>
                     <button class="btn sm" id="logout">Выйти</button></div>
                     <div class="set-row"><div class="t"><b>Синхронизация</b><span>Обновить данные прямо сейчас.</span></div><button class="btn sm" data-sync><i class="ic ic-sync ic-sm"></i>Синхронизировать</button></div></div>`}
        <h2>Ответы бота</h2>
        <div class="card">
            <div class="set-row" style="padding-top:0"><div class="t"><b>Длина ответов</b><span id="lenHint">${esc(pr.lengths[s.responseLength]?.hint || "")}</span></div>
                <select class="input" style="width:190px" data-sel="responseLength">${presetOptions(pr.lengths, s.responseLength)}</select></div>
            ${slider("minChars", "Минимальная длина ответа", 450, 3000, 50, "Общее правило для всех чатов и ботов: ответ не короче этого значения (не меньше 450 символов). Если модель ответила короче, Lumina попросит её дописать.")}
            <div class="set-row"><div class="t"><b>Мысли персонажа</b><span>Бот показывает, о чём думает персонаж, отдельным блоком ((мысли)) — как будто ваш герой умеет их читать.</span></div>
                <label class="switch"><input type="checkbox" data-b="showThoughts" ${s.showThoughts !== false ? "checked" : ""}><span></span></label></div>
            ${slider("replyTimeLimit", "Время на ответ", 20, 300, 10, "Сколько персонаж может готовить ответ. Ответ приходит целиком, а не печатается по буквам. Больше времени — длиннее и аккуратнее ответ; если модель не успевает, ответ обрезается по последнему законченному предложению.")}
            <div class="set-row"><div class="t"><b>Проверять ответ перед отправкой</b><span>Модель перечитывает черновик и исправляет орфографию, опечатки и логические нестыковки. На проверку отводится до 40% «Времени на ответ»; если не успевает — отправляется черновик.</span></div>
                <label class="switch"><input type="checkbox" data-b="replyReview" ${s.replyReview !== false ? "checked" : ""}><span></span></label></div>
        </div>
        <h2>Уведомления об ответах</h2>
        <div class="card">
            <div class="set-row" style="padding-top:0"><div class="t"><b>Звук и вибрация <span class="muted small">(это устройство)</span></b><span>Короткий сигнал, когда ответ пришёл, пока Lumina открыта.</span></div>
                <label class="switch"><input type="checkbox" id="pSound" ${getPrefs().sound !== false ? "checked" : ""}><span></span></label></div>
            ${D ? `<div class="set-row"><div class="t"><b>Уведомления Windows</b><span>Когда окно Lumina свёрнуто или в трее.</span></div>
                <label class="switch"><input type="checkbox" data-b="desktopNotify" ${s.desktopNotify !== false ? "checked" : ""}><span></span></label></div>` : ""}
            <div class="set-row"><div class="t"><b>Push-уведомления на телефон</b><span>Приходят, даже когда телефон заблокирован и Lumina закрыта. Работают через бесплатное приложение <b>ntfy</b>; компьютеру нужен интернет.</span></div>
                <label class="switch"><input type="checkbox" data-b="ntfyEnabled" id="ntfyOn" ${s.ntfyEnabled ? "checked" : ""}><span></span></label></div>
            <div id="ntfyBox"></div>
        </div>
        <h2>Словарь</h2>
        <div class="card"><div class="set-row" style="padding:0"><div class="t"><b>Сленг, термины и факты о мире</b><span>Бот получает значение слова, когда оно встречается в переписке. Можно найти значение в интернете и сохранить.</span></div>
            <a class="btn sm" href="#/lore"><i class="ic ic-quote ic-sm"></i>Открыть</a></div></div>
        <h2>Формат сообщений</h2>
        <div class="card">
            <div class="set-row" style="padding-top:0"><div class="t"><b>Стиль ответов</b><span>«Универсальный» разделяет ответ на действия, реплики и мысли.</span></div>
                <select class="input" style="width:220px" id="styleSel">${presetOptions(styles, s.style)}</select></div>
            <div id="stylePrev"></div>
            <div class="row wrap" style="justify-content:flex-end;gap:8px;margin-top:12px">
                <button class="btn sm" id="stCopy"><i class="ic ic-plus ic-sm"></i>Создать свой стиль на основе этого</button>
                <button class="btn sm" id="stNew"><i class="ic ic-plus ic-sm"></i>Новый стиль с нуля</button>
                <button class="btn sm" id="stEdit" hidden><i class="ic ic-edit ic-sm"></i>Изменить</button>
                <button class="btn sm danger" id="stDel" hidden><i class="ic ic-trash ic-sm"></i>Удалить</button>
            </div>
            <div class="hint small muted" style="margin-top:12px">Разметка, которую понимает Lumina: <span class="macro">*действие*</span> · <span class="macro">— реплика</span> · <span class="macro">((мысли))</span>. В своём стиле напишите правила и пример ответа — бот повторит манеру примера, но не его содержание.</div>
        </div>
        <h2>Память бота</h2>
        <div class="card">
            ${slider("contextSize", "Объём памяти (контекст модели)", 2048, 32768, 2048, "Сколько текста модель держит в голове одновременно. Больше — бот помнит дольше, но нужно больше видеопамяти/ОЗУ. 8192 ≈ 20–25 тыс. символов. После изменения перезагрузите модель.")}
            ${slider("memoryMessages", "Ограничитель памяти", 0, 300, 10, "Сколько последних сообщений бот перечитывает. 0 — вся переписка, сколько поместится в память. Для отдельных чатов можно задать своё значение и «Контекст чата» (кнопка ⚙ в чате).")}
        </div>
        <h2>Внешний вид <span class="muted small" style="font-weight:500">(это устройство)</span></h2>
        <div class="card">${appearanceHTML()}</div>
        <h2>Генерация</h2>
        <div class="card">
            <div class="set-row" style="padding-top:0"><div class="t"><b>Характер ответов</b><span id="presetHint">${esc((pr.samplers || {})[s.samplerPreset]?.hint || "Свои значения (см. «Для опытных»)")}</span></div>
                <select class="input" style="width:200px" id="presetSel">${Object.entries(pr.samplers || {}).map(([k, v]) => `<option value="${k}" ${s.samplerPreset === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}
                    <option value="custom" ${!(pr.samplers || {})[s.samplerPreset] ? "selected" : ""}>Свой</option></select></div>
            <div class="set-row"><div class="t"><b>Проверка орфографии словарём</b><span>Перед отправкой ответ проверяется русским словарём (без интернета, доли секунды): явные опечатки исправляются сразу, сомнительные слова — при проверке моделью.</span></div>
                <label class="switch"><input type="checkbox" data-b="spellCheck" ${s.spellCheck !== false ? "checked" : ""}><span></span></label></div>
            <details class="adv" id="advGen"><summary>Для опытных</summary>
                <div id="genWarn"></div>
                ${slider("temperature", "Креативность (temperature)", 0.1, 2, 0.05, "Выше — неожиданнее, но больше ошибок и бессвязности. Для моделей 7–14B разумно 0.6–1.0.")}
                ${slider("minP", "Min P", 0, 0.3, 0.01, "Отсекает маловероятные слова. 0.05–0.1 — хорошо для ролевых игр.")}
                ${slider("topP", "Top P", 0.5, 1, 0.01, "")}
                ${slider("repeatPenalty", "Штраф за повторы (классический)", 1, 1.5, 0.01, "Штрафует отдельные слова и окончания — в русском при значениях выше 1.1 появляются искажённые слова. Лучше держать 1.0–1.05 и использовать DRY.")}
                ${slider("dryStrength", "Антиповтор фраз (DRY)", 0, 1, 0.05, "Не даёт повторять целые фразы и обороты, не трогая отдельные слова. 0.8 — рекомендуется, 0 — выключено.")}
            </details>
        </div>
        <h2>Модель</h2>
        <div class="card">
            <div class="set-row"><div class="t"><b>Вычисления</b><span>«Авто» использует видеокарту, если она есть.</span></div>
                <select class="input" style="width:150px" data-sel="gpu">${[["auto", "Авто"], ["vulkan", "Видеокарта"], ["cpu", "Процессор"]].map(([v, l]) => `<option value="${v}" ${v === s.gpu ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="set-row"><div class="t"><b>Загружать модель при запуске</b><span>Последняя использованная модель будет готова сразу.</span></div>
                <label class="switch"><input type="checkbox" data-b="autoLoadModel" ${s.autoLoadModel ? "checked" : ""}><span></span></label></div>
        </div>
        <h2>Системный промпт</h2>
        <div class="card">
            <div class="muted small" style="margin-bottom:10px">Общие указания для всех персонажей. <span class="macro">{{bot}}</span> — сюда подставляется профиль персонажа, <span class="macro">{{persona}}</span> — ваша персона.</div>
            <textarea class="input" id="sys" rows="12" style="font-size:14px">${esc(s.systemTemplate)}</textarea>
            <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm" id="sysreset">Вернуть стандартный</button><button class="btn sm primary" id="syssave">Сохранить</button></div>
        </div>
        ${D ? `<h2>Программа</h2><div class="card">
            <div class="set-row" style="padding-top:0"><div class="t"><b>Сворачивать в трей при закрытии окна</b><span>Lumina продолжит работать в фоне (значок у часов), телефон останется подключённым.</span></div>
                <label class="switch"><input type="checkbox" data-b="closeToTray" ${s.closeToTray ? "checked" : ""}><span></span></label></div>
            <div class="set-row"><div class="t"><b>Закрыть программу</b><span>Полностью выключить Lumina и выгрузить модель. То же самое: правый клик по значку в трее → «Закрыть Lumina».</span></div>
                <div class="row" style="gap:8px"><button class="btn sm" id="toTray">В трей</button><button class="btn sm danger" id="quitApp"><i class="ic ic-power ic-sm"></i>Закрыть</button></div></div>
        </div>` : ""}
        <div class="muted small" style="text-align:center;margin-top:30px">Lumina 1.5 · всё хранится только на вашем компьютере</div>
    </div>`;

    const save = debounce(async (patch) => {
        try {
            const r = await api("PUT", "/api/settings", patch);
            S.settings = r.settings;
            if (r.reloadSuggested) toast("Чтобы применить, перезагрузите модель на вкладке «Модель»", {ms: 5000});
        } catch (e) { toast(e.message, {error: true}); }
    }, 350);
    let pend = {};
    const queue = (k, v) => { pend[k] = v; const p = pend; save(p); pend = {...p}; };
    const GEN_KEYS = ["temperature", "minP", "topP", "repeatPenalty", "dryStrength"];
    const genWarn = () => {
        const t = +$("[data-s=temperature]").value, rp = +$("[data-s=repeatPenalty]").value;
        const w = [];
        if (t > 1.2) w.push(`Температура ${t} — высоко: модель будет чаще ошибаться в словах и терять нить разговора.`);
        if (rp > 1.12) w.push(`Штраф за повторы ${rp} — высоко: в русском это ломает окончания и слова.`);
        $("#genWarn").innerHTML = w.length ? `<div class="banner" style="margin:8px 0 4px"><i class="ic ic-spark"></i><div class="small">${w.join("<br>")}</div></div>` : "";
    };
    $$("[data-s]").forEach(r => r.oninput = () => {
        const v = r.step.includes(".") || +r.step < 1 ? parseFloat(r.value) : parseInt(r.value);
        $("#o_" + r.dataset.s).textContent = fmtv(r.dataset.s, v);
        queue(r.dataset.s, v);
        if (GEN_KEYS.includes(r.dataset.s)) {
            $("#presetSel").value = "custom";
            $("#presetHint").textContent = "Свои значения";
            genWarn();
        }
    });
    $("#presetSel").onchange = async (e) => {
        const k = e.target.value;
        if (k === "custom") { $("#advGen").open = true; $("#presetHint").textContent = "Свои значения"; return; }
        try {
            const r = await api("PUT", "/api/settings", {samplerPreset: k});
            S.settings = r.settings;
            for (const g of GEN_KEYS) {
                const el = $(`[data-s=${g}]`); if (!el) continue;
                el.value = S.settings[g]; $("#o_" + g).textContent = fmtv(g, S.settings[g]);
            }
            $("#presetHint").textContent = pr.samplers[k]?.hint || "";
            genWarn();
            toast(`Набор «${pr.samplers[k]?.label}» применён`);
        } catch (err) { toast(err.message, {error: true}); }
    };
    genWarn();
    $$("[data-sel]").forEach(el => el.onchange = () => {
        queue(el.dataset.sel, el.dataset.sel === "contextSize" ? +el.value : el.value);
        if (el.dataset.sel === "responseLength") $("#lenHint").textContent = pr.lengths[el.value]?.hint || "";
    });
    bindAppearance(view);
    // --- стили ---
    const drawStylePrev = () => {
        const all = allStyles(), k = $("#styleSel").value, st = all[k];
        $("#stylePrev").innerHTML = st ? `
            ${st.rules ? `<div class="small muted" style="white-space:pre-wrap;margin:6px 0 10px">${esc(st.rules)}</div>` : ""}
            ${st.example ? `<div class="small muted" style="margin-bottom:6px">Так будет выглядеть ответ:</div><div class="bubble style-preview">${fmtBot(st.example)}</div>` : ""}` : "";
        $("#stEdit").hidden = $("#stDel").hidden = !st?.custom;
    };
    const saveStyles = async (list, selectKey) => {
        const r = await api("PUT", "/api/settings", {customStyles: list, ...(selectKey ? {style: selectKey} : {})});
        S.settings = r.settings;
        const sel = $("#styleSel");
        sel.innerHTML = presetOptions(allStyles(), S.settings.style);
        drawStylePrev();
    };
    $("#styleSel").onchange = async (e) => {
        const r = await api("PUT", "/api/settings", {style: e.target.value});
        S.settings = r.settings; drawStylePrev(); toast("Стиль применён ко всем чатам");
    };
    const openStyleEditor = (base, existing) => {
        const f = {label: existing?.label || (base ? base.label.replace(/^★ /, "") + " (мой)" : ""), rules: base?.rules || "", example: base?.example || ""};
        modal(`<h3>${existing ? "Изменить стиль" : "Свой стиль ответов"}</h3>
            <div class="field"><label>Название</label><input class="input" id="se_l" maxlength="60" value="${esc(f.label)}" placeholder="Например: Манга-нуар"></div>
            <div class="field"><label>Правила оформления</label><div class="hint">Как писать: от какого лица, что выделять, какие блоки использовать.</div>
                <textarea class="input" id="se_r" rows="6" placeholder="Действия — в *звёздочках*, реплики — с новой строки через тире, мысли — в ((двойных скобках))…">${esc(f.rules)}</textarea></div>
            <div class="field"><label>Пример ответа</label><div class="hint">Бот будет повторять манеру и формат этого примера.</div>
                <textarea class="input" id="se_e" rows="9" placeholder="*Она медленно садится напротив.*&#10;&#10;— Ты откуда это знаешь?&#10;&#10;((Кто ему рассказал?))">${esc(f.example)}</textarea></div>
            <div class="small muted" style="margin-bottom:6px">Предпросмотр:</div>
            <div class="bubble style-preview" id="se_p"></div>
            <div class="btns"><button class="btn" id="se_x">Отмена</button><button class="btn primary" id="se_ok">Сохранить и выбрать</button></div>`, {
            wide: true,
            onMount: (m) => {
                const prev = () => { $("#se_p", m.el).innerHTML = fmtBot($("#se_e", m.el).value) || `<span class="muted small">Напишите пример — здесь появится предпросмотр.</span>`; };
                $("#se_e", m.el).oninput = prev; prev();
                $("#se_x", m.el).onclick = m.close;
                $("#se_ok", m.el).onclick = async () => {
                    const label = $("#se_l", m.el).value.trim();
                    if (!label) return toast("Введите название стиля", {error: true});
                    const list = [...(S.settings.customStyles || [])];
                    const item = {id: existing?.id || null, label, rules: $("#se_r", m.el).value, example: $("#se_e", m.el).value};
                    try {
                        if (existing) {
                            const i = list.findIndex(x => x.id === existing.id);
                            list[i] = item;
                            await saveStyles(list, "c:" + existing.id);
                        } else {
                            list.push(item);
                            const before = new Set(list.map(x => x.id));
                            await saveStyles(list);
                            const created = (S.settings.customStyles || []).find(x => !before.has(x.id));
                            if (created) await saveStyles(S.settings.customStyles, "c:" + created.id);
                        }
                        m.close(); toast("Стиль сохранён и выбран");
                    } catch (e) { toast(e.message, {error: true}); }
                };
            }
        });
    };
    $("#stCopy").onclick = () => openStyleEditor(allStyles()[$("#styleSel").value], null);
    $("#stNew").onclick = () => openStyleEditor(null, null);
    $("#stEdit").onclick = () => { const st = allStyles()[$("#styleSel").value]; if (st?.custom) openStyleEditor(st, st); };
    $("#stDel").onclick = async () => {
        const st = allStyles()[$("#styleSel").value];
        if (!st?.custom || !await confirmBox("Удалить стиль?", `«${st.label.replace(/^★ /, "")}» будет удалён.`)) return;
        await saveStyles((S.settings.customStyles || []).filter(x => x.id !== st.id), "universal");
        toast("Стиль удалён");
    };
    drawStylePrev();
    if ($("#quitApp")) $("#quitApp").onclick = async () => {
        if (!await confirmBox("Закрыть Lumina?", "Программа полностью выключится, телефон отключится от компьютера.", {ok: "Закрыть", danger: true})) return;
        D.quit();
    };
    if ($("#toTray")) $("#toTray").onclick = () => D.hideToTray();
    $$("[data-b]").forEach(el => el.onchange = () => queue(el.dataset.b, el.checked));
    // --- уведомления ---
    $("#pSound").onchange = (e) => { setPref("sound", e.target.checked); if (e.target.checked) chime(); };
    const drawNtfy = () => {
        const st = S.settings, on = $("#ntfyOn").checked;
        const topic = st.ntfyTopic || "";
        $("#ntfyBox").innerHTML = on ? `
            <ol class="steps" style="margin-top:4px">
                <li>Установите на iPhone приложение <b>ntfy</b> из App Store и разрешите ему уведомления.</li>
                <li>В ntfy нажмите <b>+</b> и введите название канала (сервер оставьте ntfy.sh):</li>
            </ol>
            <div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0 12px"><span class="url" id="ntfyTopic" style="user-select:all">${esc(topic)}</span>
                <button class="btn sm" id="ntfyCopy"><i class="ic ic-copy ic-sm"></i>Копировать</button>
                <button class="btn sm ghost" id="ntfyNew" title="Новое название — старые подписки перестанут получать уведомления"><i class="ic ic-redo ic-sm"></i>Сменить</button></div>
            <div class="set-row"><div class="t"><b>Показывать начало ответа</b><span>Иначе придёт только «Персонаж ответил(а)». Текст уходит через сервер ntfy.sh — название канала держите в секрете.</span></div>
                <label class="switch"><input type="checkbox" id="ntfyText" ${st.ntfyWithText ? "checked" : ""}><span></span></label></div>
            <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm primary" id="ntfyTest"><i class="ic ic-send ic-sm"></i>Отправить тестовое уведомление</button></div>` : "";
        if (!on) return;
        $("#ntfyCopy").onclick = async () => {
            try { await navigator.clipboard.writeText(topic); }
            catch { const x = document.createElement("textarea"); x.value = topic; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); }
            toast("Название канала скопировано");
        };
        $("#ntfyNew").onclick = async () => {
            if (!await confirmBox("Сменить канал?", "Телефон придётся подписать на новое название в приложении ntfy.", {ok: "Сменить", danger: false})) return;
            S.settings = (await api("POST", "/api/notify/topic")).settings; drawNtfy();
        };
        $("#ntfyText").onchange = (e) => queue("ntfyWithText", e.target.checked);
        $("#ntfyTest").onclick = async (e) => {
            e.target.disabled = true;
            try { await api("POST", "/api/notify/test"); toast("Отправлено — проверьте телефон"); }
            catch (err) { toast(err.message, {error: true, ms: 6000}); }
            finally { e.target.disabled = false; }
        };
    };
    $("#ntfyOn").addEventListener("change", drawNtfy);
    drawNtfy();
    $("#syssave").onclick = async () => { const r = await api("PUT", "/api/settings", {systemTemplate: $("#sys").value}); S.settings = r.settings; toast("Сохранено"); };
    $("#sysreset").onclick = () => { $("#sys").value = s.defaultSystemTemplate; };
    if ($("#logout")) $("#logout").onclick = () => {
        localStorage.removeItem("lumina_token");
        document.cookie = "lumina_auth=; Max-Age=0; Path=/";
        showPin();
    };

    if (S.local) {
        const drawLan = (l) => {
            $("#lan").innerHTML = `
                <div class="set-row" style="padding-top:0"><div class="t"><b>Доступ по Wi‑Fi</b><span>Открывайте Lumina на iPhone, iPad или другом устройстве в той же сети.</span></div>
                    <label class="switch"><input type="checkbox" id="lanOn" ${l.enabled ? "checked" : ""}><span></span></label></div>
                ${l.enabled ? (l.urls.length ? `<div class="lan-box">
                    <div class="qr">${l.qr || ""}</div>
                    <div>
                        <div class="muted small">Наведите камеру iPhone на QR-код или откройте в Safari:</div>
                        <div style="margin:8px 0 16px">${l.urls.map(u => `<div class="url" style="margin:3px 0">${esc(u)}</div>`).join("")}</div>
                        <div class="muted small">PIN-код для входа</div>
                        <div class="row"><span class="pin">${esc(l.pin)}</span><button class="btn sm ghost" id="newpin" title="Новый PIN — все устройства придётся подключить заново"><i class="ic ic-redo ic-sm"></i>Сменить</button></div>
                    </div></div>
                    <ol class="steps">
                        <li>Телефон и компьютер должны быть в одной Wi‑Fi сети.</li>
                        <li>Если Windows спросит про брандмауэр — разрешите доступ в <b>частных сетях</b>.</li>
                        <li>В Safari нажмите «Поделиться» → «На экран Домой» — получится иконка как у приложения.</li>
                        <li>Компьютер должен быть включён, а Lumina — запущена (можно свернуть в трей).</li>
                    </ol>` : `<div class="banner" style="margin:14px 0 0">Не найдено подключение к локальной сети. Проверьте Wi‑Fi или кабель.</div>`) : ""}`;
            $("#lanOn").onchange = async (e) => {
                e.target.disabled = true;
                try {
                    await api("PUT", "/api/lan", {enabled: e.target.checked});
                    await sleep(500);
                    drawLan(await api("GET", "/api/lan"));
                } catch (err) { toast(err.message, {error: true}); e.target.disabled = false; }
            };
            if ($("#newpin")) $("#newpin").onclick = async () => {
                if (!await confirmBox("Сменить PIN?", "Все подключённые устройства придётся подключить заново.", {ok: "Сменить", danger: false})) return;
                await api("PUT", "/api/lan", {regeneratePin: true});
                await sleep(200);
                drawLan(await api("GET", "/api/lan"));
            };
        };
        drawLan(await api("GET", "/api/lan"));
    }
}

/* ================= вход по PIN (для телефона) ================= */
let pinShown = false;
function showPin(info) {
    if (pinShown) return;
    pinShown = true;
    document.body.classList.add("in-chat");
    $(".sidebar").style.display = "none";
    view.innerHTML = `<div class="pin-screen"><div class="pin-card">
        <img src="/icon.svg" alt="">
        <h1>Lumina</h1>
        <div class="muted">Введите PIN-код, который показан на компьютере в разделе «Настройки» → «Играть с телефона».</div>
        <input class="input pin-input" id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
        <button class="btn primary" id="go" style="width:100%">Войти</button>
        <div class="small" id="perr" style="color:var(--bad);margin-top:12px;min-height:20px">${info && !info.lanEnabled ? "Доступ по Wi‑Fi сейчас выключен на компьютере." : ""}</div>
    </div></div>`;
    const go = async () => {
        try {
            await authPin($("#pin").value);
            location.reload();
        } catch (e) { $("#perr").textContent = e.message; }
    };
    $("#go").onclick = go;
    $("#pin").oninput = (e) => { if (e.target.value.length === 6) go(); };
    $("#pin").focus();
}
async function authPin(pin) {
    const r = await fetch("/api/auth", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({pin})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Ошибка входа");
    if (d.token) localStorage.setItem("lumina_token", d.token);
}

/* ================= высота экрана на iPhone (клавиатура) ================= */
// Высота приложения. Без клавиатуры — весь экран (CSS: 100% / 100dvh), с клавиатурой — видимая часть над ней.
// iOS после закрытия клавиатуры и при запуске с экрана «Домой» какое-то время отдаёт устаревшую высоту,
// из-за чего снизу оставалась чёрная полоса, — поэтому перемеряем ещё несколько раз с задержкой.
function fitViewport() {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const full = window.innerHeight;
    const kb = isTouch && vv && full - vv.height > 120; // открыта экранная клавиатура
    if (kb) {
        root.style.setProperty("--app-h", Math.round(vv.height) + "px");
        root.style.setProperty("--vv-top", Math.max(0, Math.round(vv.offsetTop)) + "px");
        root.classList.add("kb-open");
    } else {
        root.style.removeProperty("--app-h");
        root.style.removeProperty("--vv-top");
        root.classList.remove("kb-open");
    }
    if (isTouch && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
}
let fitTimers = [];
function fitViewportSoon() {
    fitViewport();
    fitTimers.forEach(clearTimeout);
    fitTimers = [60, 250, 500, 900].map(ms => setTimeout(fitViewport, ms));
}
window.visualViewport?.addEventListener("resize", fitViewportSoon);
window.visualViewport?.addEventListener("scroll", () => {
    if (!document.documentElement.classList.contains("kb-open")) window.scrollTo(0, 0);
    else fitViewport(); // с клавиатурой iOS сдвигает видимую область — двигаем приложение следом
});
window.addEventListener("resize", fitViewportSoon);
window.addEventListener("orientationchange", fitViewportSoon);
window.addEventListener("pageshow", fitViewportSoon);
document.addEventListener("focusin", fitViewportSoon);
document.addEventListener("focusout", fitViewportSoon);
document.addEventListener("visibilitychange", () => { if (!document.hidden) fitViewportSoon(); });

/* ================= старт ================= */
(async function boot() {
    fitViewportSoon();
    const u = new URL(location.href);
    const pin = u.searchParams.get("pin");
    if (pin) {
        try { await authPin(pin); } catch {}
        history.replaceState(null, "", location.pathname + location.hash);
    }
    let a;
    try { a = await fetch("/api/auth", {headers: authHeaders()}).then(r => r.json()); }
    catch { view.innerHTML = `<div class="page"><div class="empty"><div class="big">📡</div>Нет связи с компьютером.<br>Проверьте, что Lumina запущена и вы в той же Wi‑Fi сети.</div></div>`; return; }
    if (!a.ok) {
        // кука могла не сохраниться (режим «На экран Домой») — пробуем токен из localStorage
        try { await api("GET", "/api/engine"); } catch { return; }
    }
    await loadState();
    route();
    pollEngine();
})();
