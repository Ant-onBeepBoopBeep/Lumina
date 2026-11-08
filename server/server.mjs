// HTTP-сервер Lumina: API + статика интерфейса. Работает и внутри Electron, и отдельно (node server/server.mjs).
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import QRCode from "qrcode";
import {Store, uid, currentText, DEFAULT_SYSTEM_TEMPLATE, SAMPLER_PRESETS, applyPreset} from "./store.mjs";
import {spellCheck, knownWords, warmUp as warmUpSpell} from "./spell.mjs";
import {Engine} from "./llm.mjs";
import {matchLore, loreBlock, lookupTerm, LORE_SCAN_MESSAGES} from "./lore.mjs";
import {buildSystem, chatToHistory, stopWordsFor, macros, resolveChatOptions, reminderFor, styleDef, LENGTHS, STYLES, NOTES_LIMIT, MIN_CHARS_FLOOR} from "./prompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2"
};

// ---------- проверка черновика ответа ----------
const REVIEW_SYSTEM = "Ты — внимательный литературный редактор ролевых историй на русском языке. Ты получаешь черновик реплики персонажа и возвращаешь исправленную версию. Ты не добавляешь пояснений, комментариев и заголовков — только итоговый текст.";

function reviewPrompt(bot, persona, lastUser, draft, suspicious = []) {
    const user = persona?.name || "Пользователь";
    const flagged = suspicious.length
        ? `\nСловарь отметил слова, которых нет в русском языке (вероятные ошибки): ${suspicious.slice(0, 20).map(s => `«${s.word}»${s.suggestions.length ? ` (может быть: ${s.suggestions.join(", ")})` : ""}`).join("; ")}. Исправь их, если это действительно ошибки.\n`
        : "";
    return `Персонаж: ${bot.name}. Собеседник: ${user}.

Последнее сообщение ${user}:
"""
${String(lastUser).slice(-1500)}
"""

Черновик ответа ${bot.name}:
"""
${draft}
"""

Проверь черновик и исправь:
1. Орфографию, пунктуацию, грамматику, опечатки, слова не на том языке.
2. Логику: ответ должен соответствовать сообщению ${user} и самому себе (имена, пол, кто что делает, где находятся, без противоречий и повторов).
3. Убери места, где ${bot.name} пишет слова или действия за ${user}.
${flagged}
Сохрани содержание, стиль, длину и разметку: *действия* в звёздочках, реплики с новой строки через тире, ((мысли)) в двойных скобках, пустые строки между блоками.
Выведи ТОЛЬКО исправленный текст ответа, без кавычек и пояснений. Если исправлять нечего — выведи черновик без изменений.`;
}

/** Принимаем правку редактора, только если она похожа на тот же ответ (не обрезана и не раздута). */
function acceptReview(draft, fixed) {
    let t = String(fixed || "").trim()
        .replace(/^(вот\s+)?(исправленн\w+\s+)?(текст|вариант|ответ|версия)[^\n]{0,40}:\s*/i, "")
        .replace(/^"""\s*|\s*"""$/g, "").trim();
    if (!t) return draft;
    const k = t.length / Math.max(1, draft.length);
    if (k < 0.75 || k > 1.4) return draft;
    return t;
}

/** Если генерацию оборвал лимит времени — обрезаем до последнего законченного предложения/блока. */
function trimToSentence(t) {
    t = String(t || "").trimEnd();
    if (!t || /[.!?…*)»"]$/.test(t)) return t;
    const m = t.match(/^[\s\S]*[.!?…][*)»"]*(?=\s|$)/);
    return m && m[0].length > t.length * 0.5 ? m[0].trimEnd() : t + "…";
}

export async function startServer({dataDir, staticDir = path.join(__dirname, "..", "web"), mock = false, log = console.log, onReply = null} = {}) {
    const store = new Store(dataDir);
    const engine = new Engine({mock});
    const pending = new Map(); // chatId -> {text, thinking}
    let server = null;
    let port = store.settings.port;
    let host = "127.0.0.1";
    const pinAttempts = new Map();

    // ---------- утилиты ----------
    const isLocal = (req) => {
        const a = req.socket.remoteAddress || "";
        return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
    };
    const getCookie = (req, name) => {
        const m = (req.headers.cookie || "").match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
        return m ? decodeURIComponent(m[1]) : null;
    };
    const authed = (req) => {
        if (isLocal(req)) return true;
        if (!store.settings.lanEnabled) return false;
        const t = getCookie(req, "lumina_auth") || req.headers["x-lumina-auth"];
        return !!t && store.auth.tokens.includes(t);
    };
    const send = (res, code, data) => {
        const body = JSON.stringify(data);
        res.writeHead(code, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"});
        res.end(body);
    };
    const readBody = (req, limit = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
        let size = 0; const chunks = [];
        req.on("data", (c) => {
            size += c.length;
            if (size > limit) { reject(new Error("Слишком большой запрос")); req.destroy(); return; }
            chunks.push(c);
        });
        req.on("end", () => {
            if (!chunks.length) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(new Error("Некорректный JSON")); }
        });
        req.on("error", reject);
    });

    function lanAddresses() {
        const out = [];
        for (const [name, list] of Object.entries(os.networkInterfaces())) {
            for (const a of list || []) {
                if (a.family !== "IPv4" || a.internal) continue;
                if (/^169\.254\./.test(a.address)) continue;
                const score = /^192\.168\./.test(a.address) ? 0 : /^10\./.test(a.address) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : /^100\./.test(a.address) ? 3 : 4;
                if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|br-/i.test(name)) continue;
                out.push({ip: a.address, iface: name, score});
            }
        }
        out.sort((a, b) => a.score - b.score);
        return out;
    }

    async function lanInfo() {
        const addrs = lanAddresses();
        const urls = addrs.map(a => `http://${a.ip}:${port}`);
        let qr = null;
        if (store.settings.lanEnabled && urls[0]) {
            qr = await QRCode.toString(`${urls[0]}/?pin=${store.settings.pin}`, {type: "svg", margin: 1, color: {dark: "#000000", light: "#ffffff"}});
        }
        return {enabled: store.settings.lanEnabled, urls, pin: store.settings.pin, qr, port};
    }

    function publicSettings() {
        const s = {...store.settings};
        delete s.pin;
        s.defaultSystemTemplate = DEFAULT_SYSTEM_TEMPLATE;
        s.presets = {
            lengths: Object.fromEntries(Object.entries(LENGTHS).map(([k, v]) => [k, {label: v.label, hint: v.hint}])),
            styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, {label: v.label, rules: v.rules, example: v.example}])),
            notesLimit: NOTES_LIMIT, minCharsFloor: MIN_CHARS_FLOOR,
            samplers: SAMPLER_PRESETS
        };
        return s;
    }

    function listModels() {
        const set = new Map();
        for (const p of store.settings.models) set.set(path.resolve(p), true);
        try {
            for (const f of fs.readdirSync(store.modelsDir)) if (f.toLowerCase().endsWith(".gguf")) set.set(path.join(store.modelsDir, f), true);
        } catch {}
        return [...set.keys()].map(p => {
            let size = null, exists = false;
            try { size = fs.statSync(p).size; exists = true; } catch {}
            return {path: p, name: path.basename(p), size, exists};
        });
    }

    async function loadModel(p) {
        store.settings.lastModelPath = p;
        if (!store.settings.models.includes(p) && path.dirname(p) !== store.modelsDir) store.settings.models.push(p);
        store.saveSettings();
        return engine.load(p, {contextSize: store.settings.contextSize, gpu: store.settings.gpu}).catch(() => {});
    }

    // ---------- генерация ----------
    async function generate(req, res, chat, mode, text) {
        const bot = store.bots.find(b => b.id === chat.botId);
        if (!bot) return send(res, 404, {error: "Персонаж удалён"});
        const persona = store.personas.find(p => p.id === chat.personaId) || store.personas[0] || null;
        if (engine.status !== "ready") return send(res, 409, {error: "Сначала загрузите ИИ-модель (раздел «Модель»)"});
        if (engine.busy) return send(res, 409, {error: "Модель ещё отвечает в другом чате"});

        let targetMsg = null;
        let histUpto;
        if (mode === "regenerate") {
            const last = chat.messages[chat.messages.length - 1];
            if (!last || last.role !== "bot") return send(res, 400, {error: "Нечего перегенерировать"});
            targetMsg = last;
            histUpto = chat.messages.length - 1;
        } else if (mode === "continue") {
            const last = chat.messages[chat.messages.length - 1];
            if (!last || last.role !== "bot") return send(res, 400, {error: "Нечего продолжать"});
            targetMsg = last;
            histUpto = chat.messages.length;
        } else {
            if (text && text.trim()) {
                chat.messages.push({id: uid(), role: "user", text: text.trim(), ts: Date.now()});
                store.saveChat(chat);
            }
            histUpto = chat.messages.length;
        }

        const opts = resolveChatOptions(store.settings, chat);
        const history = chatToHistory(chat, bot, persona, histUpto, opts.memoryMessages);
        if (!history.some(m => m.role === "user")) {
            history.push({role: "user", text: "*(начни сцену)*"});
        }
        // напоминание о стиле и длине — к последнему сообщению пользователя (в чате не сохраняется)
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === "user") { history[i] = {...history[i], text: history[i].text + reminderFor(opts, persona?.name || "собеседник")}; break; }
        }
        // словарь: термины из последних сообщений (и из описания персонажа) → их значения в промпт
        const scan = [bot.scenario, ...history.slice(-LORE_SCAN_MESSAGES).map(m => m.text.replace(/\n\n\(Напоминание для ответа:[\s\S]*$/, ""))].join("\n");
        const loreHits = matchLore(store.lore, scan, bot.id);
        const lore = loreBlock(loreHits);
        if (loreHits.length) log(`Lumina: словарь — ${loreHits.map(e => e.keys[0]).join(", ")}`);
        let system = buildSystem(store.settings.systemTemplate, bot, persona, opts);
        if (lore) system += "\n\n" + lore;
        const params = {...store.settings, maxTokens: opts.maxTokens};
        const stopWords = stopWordsFor(bot, persona);

        res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        });
        // Safari буферизует первые байты потока — отправляем «прокладку»
        res.write(" ".repeat(2048) + "\n");
        const out = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch {} };
        out({t: "start", userMessages: mode === "send" ? chat.messages.slice(-1) : []});

        // Ответ не печатается по буквам: модель пишет черновик, проверяет его и присылает целиком.
        // Всё укладывается в лимит времени replyTimeLimit (настройки → «Время на ответ»).
        const state = {text: "", thinking: false, phase: "writing", mode, targetId: targetMsg?.id || null, startedAt: Date.now()};
        pending.set(chat.id, state);
        const prefix = mode === "continue" ? currentText(targetMsg) : "";
        const limitMs = Math.max(20, Math.min(300, store.settings.replyTimeLimit | 0 || 60)) * 1000;
        const deadline = Date.now() + limitMs;
        const left = () => deadline - Date.now();
        const setPhase = (phase) => { state.phase = phase; out({t: "phase", phase, startedAt: state.startedAt, limitMs}); };
        let speed = 0; // скорость письма модели, символов в мс (без времени на чтение истории)

        const run = async (hist, {sys = system, prm = params, reserveMs = 0} = {}) => {
            let tFirst = 0;
            const r = await engine.generate({
                system: sys, history: hist, params: prm, stopWords,
                timeoutMs: Math.max(3000, left() - reserveMs),
                onThinking: () => { state.thinking = true; out({t: "thinking"}); },
                onText: () => { if (!tFirst) tFirst = Date.now(); }
            });
            const txt = cleanup(r, bot, persona);
            if (tFirst && txt.length > 80) speed = txt.length / Math.max(1, Date.now() - tFirst);
            return engine.timedOut ? trimToSentence(txt) : txt;
        };
        const userStopped = () => engine.lastAborted;

        try {
            setPhase("writing");
            const baseHist = mode === "continue"
                ? [...history, {role: "user", text: "*(продолжи свой последний ответ с того места, где он оборвался)*"}]
                : history;
            // при включённой проверке оставляем на неё ~40% времени (переписать текст ≈ столько же, сколько написать)
            const reviewOn = store.settings.replyReview !== false && mode !== "continue";
            const reserve = reviewOn ? Math.floor(limitMs * 0.4) : 0;

            // 1) черновик; если модель вернула пустоту — пробуем ещё раз
            let generated = "";
            for (let attempt = 0; attempt < 3 && !generated && !userStopped() && left() > 5000; attempt++) {
                if (attempt > 0) log(`Lumina: пустой ответ модели, повтор ${attempt}`);
                generated = await run(baseHist, {reserveMs: reserve});
            }

            // 2) общее правило: ответ не короче minChars — если короче и есть время, просим дописать
            if (mode !== "continue") {
                for (let ext = 0; ext < 2 && generated && generated.length < opts.minChars && !userStopped() && left() - reserve > 8000; ext++) {
                    const need = opts.minChars - generated.length;
                    const more = await run([
                        ...history,
                        {role: "bot", text: generated},
                        {role: "user", text: `(Продолжи свой ответ ровно с того места, где он закончился. Допиши ещё не меньше ${Math.max(need, 200)} символов: действия, детали, эмоции. Не повторяй уже написанное и не пиши за собеседника.)`}
                    ], {reserveMs: reserve});
                    if (!more) break;
                    generated = generated + "\n\n" + more;
                }
            }

            const lastUser = [...history].reverse().find(m => m.role === "user")?.text.replace(/\n\n\(Напоминание для ответа:[\s\S]*$/, "") || "";

            // 3) орфография словарём (офлайн, доли секунды): очевидные опечатки правим сразу, остальное — подсказка для проверки
            let suspicious = [];
            if (store.settings.spellCheck !== false && generated && !userStopped()) {
                try {
                    const known = knownWords(bot.name, bot.description, bot.personality, bot.scenario, bot.greeting,
                        persona?.name, persona?.description, lastUser, ...store.lore.flatMap(e => [...e.keys, e.content]));
                    const sc = await spellCheck(generated, known);
                    generated = sc.fixed;
                    suspicious = sc.suspicious;
                    if (sc.autoFixed.length || suspicious.length)
                        log(`Lumina: орфография — исправлено ${sc.autoFixed.length}, под вопросом ${suspicious.length}`);
                } catch (e) { log("spell error", e?.message || e); }
            }

            // 4) проверка моделью на логику и орфографию — только если успеваем по времени
            if (reviewOn && generated && !userStopped()) {
                const need = speed > 0 ? generated.length / speed * 1.1 + 3000 : Infinity;
                if (need < left()) {
                    setPhase("checking");
                    const fixed = await run([{role: "user", text: reviewPrompt(bot, persona, lastUser, generated, suspicious)}], {
                        sys: REVIEW_SYSTEM,
                        prm: {...params, temperature: 0.2, minP: 0.05, topP: 0.9, repeatPenalty: 1.05, maxTokens: Math.ceil(generated.length / 2) + 200}
                    });
                    if (!engine.timedOut && !userStopped()) {
                        const before = generated;
                        generated = acceptReview(generated, fixed);
                        log(`Lumina: проверка ${generated === before ? "— без изменений/отклонена" : "внесла правки"}`);
                    } else log("Lumina: проверка не уложилась во время — отправлен черновик");
                } else log(`Lumina: проверка пропущена — не успеваем (нужно ~${Math.round(need / 1000)} с, осталось ${Math.round(left() / 1000)} с)`);
            }

            if (!generated) {
                out({t: "error", error: userStopped()
                    ? "Ответ остановлен"
                    : left() <= 5000 ? "Модель не успела ответить за отведённое время. Увеличьте «Время на ответ» в настройках или выберите модель полегче."
                    : "Модель вернула пустой ответ. Попробуйте ещё раз или выберите другую модель."});
                return;
            }
            setPhase("sending");
            log(`Lumina: ответ ${generated.length} симв. за ${Math.round((Date.now() - state.startedAt) / 1000)} с`);

            let msg;
            // перечитываем чат: пока шла генерация, его могли изменить с другого устройства
            const fresh = store.getChat(chat.id) || chat;
            if (mode === "regenerate") {
                msg = fresh.messages.find(m => m.id === targetMsg.id);
                if (msg) {
                    msg.swipes = (msg.swipes || [currentText(msg)]).filter(x => x && x.trim());
                    msg.swipes.push(generated);
                    msg.swipeIndex = msg.swipes.length - 1;
                }
            } else if (mode === "continue") {
                msg = fresh.messages.find(m => m.id === targetMsg.id);
                if (msg) {
                    const sep = /\s$/.test(prefix) || /^[\s,.!?…]/.test(generated) ? "" : " ";
                    msg.swipes[msg.swipeIndex ?? 0] = prefix + sep + generated;
                }
            } else {
                msg = {id: uid(), role: "bot", swipes: [generated], swipeIndex: 0, ts: Date.now()};
                fresh.messages.push(msg);
            }
            store.saveChat(fresh);
            out({t: "done", message: msg, chat: fresh});
            notifyReply(bot, fresh, generated);
        } catch (e) {
            out({t: "error", error: String(e?.message || e)});
        } finally {
            pending.delete(chat.id);
            res.end();
        }
    }

    // Краткая сводка переписки для поля «Контекст чата»
    async function summarize(chat) {
        const bot = store.bots.find(b => b.id === chat.botId);
        if (!bot) throw new Error("Персонаж удалён");
        const persona = store.personas.find(p => p.id === chat.personaId) || store.personas[0] || null;
        if (engine.status !== "ready") throw new Error("Сначала загрузите ИИ-модель");
        if (engine.busy) throw new Error("Модель сейчас занята ответом");
        const hist = chatToHistory(chat, bot, persona);
        if (!hist.length) throw new Error("В чате пока нечего пересказывать");
        const user = persona?.name || "Пользователь";
        const budget = Math.max(3000, Math.floor((engine.context?.contextSize || 8192) * 2) - 2500);
        let transcript = hist.map(m => `${m.role === "user" ? user : bot.name}: ${m.text}`).join("\n\n");
        if (transcript.length > budget) transcript = "…" + transcript.slice(-budget);
        const prev = String(chat.settings?.notes || "").trim();
        const r = await engine.generate({
            system: "Ты — внимательный редактор. Составляешь краткую сводку ролевой истории, чтобы рассказчик не забыл важное. Пиши по-русски, сжато, пунктами.",
            history: [{role: "user", text:
                (prev ? `Предыдущая сводка:\n${prev}\n\n` : "") +
                `Переписка:\n${transcript}\n\n` +
                `Составь сводку не длиннее ${NOTES_LIMIT - 100} символов: кто есть кто (${bot.name}, ${user} и другие), ключевые события по порядку, отношения между персонажами, текущее место и ситуация, данные обещания и важные детали. Только сводка, без вступлений.`}],
            params: {...store.settings, temperature: 0.4, maxTokens: 700}
        });
        return String(r || "").trim().slice(0, NOTES_LIMIT);
    }

    // ---------- уведомления о готовом ответе ----------
    function chatLink(chatId) {
        const a = store.settings.lanEnabled ? lanAddresses()[0] : null;
        return a ? `http://${a.ip}:${port}/#/chat/${chatId}` : null;
    }
    async function sendNtfy({title, message, click}) {
        const s = store.settings;
        const server = String(s.ntfyServer || "https://ntfy.sh").replace(/\/+$/, "");
        const r = await fetch(server, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({topic: s.ntfyTopic, title, message, tags: ["speech_balloon"], ...(click ? {click} : {})}),
            signal: AbortSignal.timeout(10000)
        });
        if (!r.ok) throw new Error(`ntfy: HTTP ${r.status}`);
    }
    function notifyReply(bot, chat, text) {
        const preview = String(text || "").replace(/[*()]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
        const en = store.settings.uiLang === "en";
        const title = en ? `${bot.name} replied` : `${bot.name} ответил(а)`;
        try { onReply?.({chatId: chat.id, botName: bot.name, title, preview}); } catch {}
        if (store.settings.ntfyEnabled && store.settings.ntfyTopic) {
            sendNtfy({title, message: store.settings.ntfyWithText ? preview : (en ? "New message in a Lumina chat" : "Новое сообщение в чате Lumina"), click: chatLink(chat.id)})
                .catch(e => log("ntfy error", e?.message || e));
        }
    }

    function cleanup(text, bot, persona) {
        let t = String(text || "").replace(/\s+$/, "");
        const name = bot.name || "";
        // модель иногда начинает с «Имя:»
        if (name && t.startsWith(name + ":")) t = t.slice(name.length + 1);
        return t.trim();
    }

    // ---------- маршруты ----------
    async function api(req, res, url) {
        const p = url.pathname;
        const m = req.method;
        let mm;

        if (p === "/api/auth" && m === "POST") {
            const ip = req.socket.remoteAddress;
            const tries = pinAttempts.get(ip) || {n: 0, t: Date.now()};
            if (Date.now() - tries.t > 10 * 60 * 1000) { tries.n = 0; tries.t = Date.now(); }
            if (tries.n >= 10) return send(res, 429, {error: "Слишком много попыток. Подождите 10 минут."});
            const body = await readBody(req);
            if (!store.settings.lanEnabled) return send(res, 403, {error: "Доступ с других устройств выключен на компьютере"});
            if (String(body.pin || "").trim() !== store.settings.pin) {
                tries.n++; pinAttempts.set(ip, tries);
                return send(res, 401, {error: "Неверный PIN"});
            }
            const token = crypto.randomBytes(24).toString("hex");
            store.auth.tokens.push(token);
            store.auth.tokens = store.auth.tokens.slice(-50);
            store.saveAuth();
            res.setHeader("Set-Cookie", `lumina_auth=${token}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
            return send(res, 200, {ok: true, token});
        }
        if (p === "/api/auth" && m === "GET") {
            return send(res, 200, {ok: authed(req), local: isLocal(req), lanEnabled: store.settings.lanEnabled});
        }

        if (!authed(req)) return send(res, 401, {error: "auth"});

        // --- общее состояние ---
        if (p === "/api/state" && m === "GET") {
            return send(res, 200, {
                engine: engine.info(),
                settings: publicSettings(),
                local: isLocal(req),
                metaRev: store.metaRev, chatRev: store.chatRev,
                bots: store.bots,
                personas: store.personas,
                loreCount: store.lore.length
            });
        }
        if (p === "/api/engine" && m === "GET") return send(res, 200, {...engine.info(), metaRev: store.metaRev, chatRev: store.chatRev});

        // --- настройки ---
        if (p === "/api/settings" && m === "PUT") {
            const body = await readBody(req);
            const allowed = ["contextSize", "gpu", "temperature", "minP", "topP", "topK", "repeatPenalty", "maxTokens", "systemTemplate", "defaultPersonaId", "autoLoadModel", "closeToTray",
                "responseLength", "style", "minChars", "memoryMessages", "showThoughts", "customStyles",
                "replyTimeLimit", "replyReview", "desktopNotify", "ntfyEnabled", "ntfyServer", "ntfyWithText", "dryStrength", "spellCheck", "uiLang"];
            const wasGpu = store.settings.gpu, wasCtx = store.settings.contextSize;
            for (const k of allowed) if (k in body) store.settings[k] = body[k];
            const st = store.settings;
            // выбрали набор — подставляем его значения; тронули ползунок генерации вручную — набор становится «Свой»
            if (SAMPLER_PRESETS[body.samplerPreset]) applyPreset(st, body.samplerPreset);
            else if (["temperature", "minP", "topP", "topK", "repeatPenalty", "dryStrength"].some(k => k in body)) st.samplerPreset = "custom";
            st.temperature = Math.max(0.05, Math.min(2, +st.temperature || 0.8));
            st.repeatPenalty = Math.max(1, Math.min(1.5, +st.repeatPenalty || 1));
            st.dryStrength = Math.max(0, Math.min(1, +st.dryStrength || 0));
            st.spellCheck = st.spellCheck !== false;
            st.uiLang = st.uiLang === "en" ? "en" : "ru";
            st.minChars = Math.max(MIN_CHARS_FLOOR, Math.min(5000, parseInt(st.minChars) || MIN_CHARS_FLOOR));
            st.memoryMessages = Math.max(0, Math.min(1000, parseInt(st.memoryMessages) || 0));
            st.contextSize = Math.max(2048, Math.min(65536, parseInt(st.contextSize) || 8192));
            if (!LENGTHS[st.responseLength]) st.responseLength = "medium";
            st.customStyles = (Array.isArray(st.customStyles) ? st.customStyles : []).slice(0, 30).map(c => ({
                id: /^[a-f0-9]{16}$/.test(c?.id || "") ? c.id : uid(),
                label: String(c?.label || "Мой стиль").slice(0, 60),
                rules: String(c?.rules || "").slice(0, 3000),
                example: String(c?.example || "").slice(0, 5000)
            }));
            st.showThoughts = st.showThoughts !== false;
            st.replyTimeLimit = Math.max(20, Math.min(300, parseInt(st.replyTimeLimit) || 60));
            st.replyReview = st.replyReview !== false;
            st.desktopNotify = st.desktopNotify !== false;
            st.ntfyEnabled = !!st.ntfyEnabled;
            st.ntfyWithText = !!st.ntfyWithText;
            st.ntfyServer = /^https?:\/\/[^\s]+$/i.test(String(st.ntfyServer || "")) ? String(st.ntfyServer).slice(0, 200) : "https://ntfy.sh";
            if (!styleDef(st, st.style)) st.style = "universal";
            store.saveSettings();
            const reload = (wasGpu !== store.settings.gpu || wasCtx !== store.settings.contextSize) && engine.status === "ready";
            return send(res, 200, {settings: publicSettings(), reloadSuggested: reload});
        }

        // --- словарь (лорбук) ---
        if (p === "/api/lore" && m === "GET") return send(res, 200, store.lore);
        if (p === "/api/lore" && m === "POST") {
            const e = sanitizeLore({...(await readBody(req)), id: uid(), createdAt: Date.now()});
            if (!e.keys.length) return send(res, 400, {error: "Укажите хотя бы одно слово-ключ"});
            store.lore.unshift(e);
            store.saveLore();
            return send(res, 200, e);
        }
        if ((mm = p.match(/^\/api\/lore\/([a-f0-9]{16})$/))) {
            const i = store.lore.findIndex(x => x.id === mm[1]);
            if (i < 0) return send(res, 404, {error: "Запись не найдена"});
            if (m === "PUT") {
                const e = sanitizeLore({...store.lore[i], ...(await readBody(req)), id: store.lore[i].id});
                if (!e.keys.length) return send(res, 400, {error: "Укажите хотя бы одно слово-ключ"});
                store.lore[i] = e; store.saveLore();
                return send(res, 200, e);
            }
            if (m === "DELETE") { store.lore.splice(i, 1); store.saveLore(); return send(res, 200, {ok: true}); }
        }
        // ручной поиск значения в интернете (уходит только сам термин)
        if (p === "/api/lookup" && m === "POST") {
            const {q} = await readBody(req);
            try { return send(res, 200, {q, results: await lookupTerm(q)}); }
            catch (e) { return send(res, 502, {error: String(e?.message || e)}); }
        }
        // сжать найденное в короткое определение для словаря — локальной моделью
        if (p === "/api/lookup/condense" && m === "POST") {
            const {term, text} = await readBody(req);
            if (engine.status !== "ready") return send(res, 409, {error: "Модель не загружена"});
            if (engine.busy) return send(res, 409, {error: "Модель сейчас занята ответом"});
            try {
                const r = await engine.generate({
                    system: "Ты составляешь краткие словарные определения на русском языке.",
                    history: [{role: "user", text: `Термин: «${String(term).slice(0, 100)}»\n\nСправка:\n${String(text).slice(0, 3000)}\n\nНапиши определение термина в 1–2 предложениях простым языком, как в словаре сленга: что значит и в каком контексте употребляется. Только определение, без вступлений.`}],
                    params: {...store.settings, temperature: 0.3, maxTokens: 160}, timeoutMs: 45000
                });
                return send(res, 200, {text: String(r || "").trim()});
            } catch (e) { return send(res, 409, {error: String(e?.message || e)}); }
        }

        // --- уведомления ---
        if (p === "/api/notify/test" && m === "POST") {
            try {
                const base = chatLink("");
                await sendNtfy({title: "Lumina", message: store.settings.uiLang === "en" ? "Test: reply notifications work ✨" : "Проверка: уведомления об ответах работают ✨", click: base ? base.replace(/#\/chat\/$/, "") : null});
                return send(res, 200, {ok: true});
            } catch (e) { return send(res, 502, {error: "Не удалось отправить: " + (e?.message || e) + ". Нужен интернет на компьютере."}); }
        }
        if (p === "/api/notify/topic" && m === "POST") {
            store.settings.ntfyTopic = "lumina-" + crypto.randomBytes(8).toString("hex");
            store.saveSettings();
            return send(res, 200, {settings: publicSettings()});
        }

        // --- доступ по сети ---
        if (p === "/api/lan" && m === "GET") {
            if (!isLocal(req)) return send(res, 403, {error: "Только с компьютера"});
            return send(res, 200, await lanInfo());
        }
        if (p === "/api/lan" && m === "PUT") {
            if (!isLocal(req)) return send(res, 403, {error: "Только с компьютера"});
            const body = await readBody(req);
            if (body.regeneratePin) {
                store.settings.pin = String(crypto.randomInt(100000, 1000000));
                store.auth.tokens = [];
                store.saveAuth();
            }
            if ("enabled" in body) store.settings.lanEnabled = !!body.enabled;
            store.saveSettings();
            send(res, 200, await (async () => { const i = await lanInfo(); return i; })());
            setTimeout(() => rebind().catch(e => log("rebind error", e)), 50);
            return;
        }

        // --- модели ---
        if (p === "/api/models" && m === "GET") {
            return send(res, 200, {list: listModels(), dir: store.modelsDir, engine: engine.info(), lastModelPath: store.settings.lastModelPath});
        }
        if (p === "/api/models/add" && m === "POST") {
            const {path: mp} = await readBody(req);
            if (!mp || !mp.toLowerCase().endsWith(".gguf")) return send(res, 400, {error: "Нужен файл .gguf"});
            if (!fs.existsSync(mp)) return send(res, 400, {error: "Файл не найден"});
            const abs = path.resolve(mp);
            if (!store.settings.models.includes(abs)) store.settings.models.push(abs);
            store.saveSettings();
            return send(res, 200, {list: listModels()});
        }
        if (p === "/api/models/remove" && m === "POST") {
            const {path: mp} = await readBody(req);
            store.settings.models = store.settings.models.filter(x => x !== mp);
            if (store.settings.lastModelPath === mp) store.settings.lastModelPath = null;
            store.saveSettings();
            if (engine.modelPath === mp) await engine.unload();
            return send(res, 200, {list: listModels()});
        }
        if (p === "/api/models/load" && m === "POST") {
            const {path: mp} = await readBody(req);
            if (!mp) return send(res, 400, {error: "Не указан путь"});
            loadModel(mp);
            return send(res, 200, engine.info());
        }
        if (p === "/api/models/unload" && m === "POST") {
            await engine.unload();
            return send(res, 200, engine.info());
        }
        if (p === "/api/stop" && m === "POST") {
            engine.stop();
            return send(res, 200, {ok: true});
        }

        // --- боты ---
        if (p === "/api/bots" && m === "GET") return send(res, 200, store.bots);
        if (p === "/api/bots" && m === "POST") {
            const body = await readBody(req);
            const bot = sanitizeBot({...body, id: uid(), createdAt: Date.now()});
            store.bots.unshift(bot);
            store.saveBots();
            return send(res, 200, bot);
        }
        if ((mm = p.match(/^\/api\/bots\/([a-f0-9]{16})$/))) {
            const i = store.bots.findIndex(b => b.id === mm[1]);
            if (i < 0) return send(res, 404, {error: "Не найден"});
            if (m === "PUT") {
                const body = await readBody(req);
                store.bots[i] = sanitizeBot({...store.bots[i], ...body, id: store.bots[i].id});
                store.saveBots();
                return send(res, 200, store.bots[i]);
            }
            if (m === "DELETE") {
                const [b] = store.bots.splice(i, 1);
                store.saveBots();
                for (const c of store.listChats()) if (c.botId === b.id) store.deleteChat(c.id);
                return send(res, 200, {ok: true});
            }
        }

        // --- персоны ---
        if (p === "/api/personas" && m === "POST") {
            const body = await readBody(req);
            const per = sanitizePersona({...body, id: uid(), createdAt: Date.now()});
            store.personas.push(per);
            store.savePersonas();
            return send(res, 200, per);
        }
        if ((mm = p.match(/^\/api\/personas\/([a-f0-9]{16})$/))) {
            const i = store.personas.findIndex(b => b.id === mm[1]);
            if (i < 0) return send(res, 404, {error: "Не найдена"});
            if (m === "PUT") {
                const body = await readBody(req);
                store.personas[i] = sanitizePersona({...store.personas[i], ...body, id: store.personas[i].id});
                store.savePersonas();
                return send(res, 200, store.personas[i]);
            }
            if (m === "DELETE") {
                if (store.personas.length <= 1) return send(res, 400, {error: "Нужна хотя бы одна персона"});
                store.personas.splice(i, 1);
                if (store.settings.defaultPersonaId === mm[1]) {
                    store.settings.defaultPersonaId = store.personas[0].id;
                    store.saveSettings();
                }
                store.savePersonas();
                return send(res, 200, {ok: true});
            }
        }

        // --- чаты ---
        if (p === "/api/chats" && m === "GET") {
            const botId = url.searchParams.get("botId");
            let list = store.listChats();
            if (botId) list = list.filter(c => c.botId === botId);
            return send(res, 200, list);
        }
        if (p === "/api/chats" && m === "POST") {
            const body = await readBody(req);
            const bot = store.bots.find(b => b.id === body.botId);
            if (!bot) return send(res, 404, {error: "Персонаж не найден"});
            const personaId = body.personaId || store.settings.defaultPersonaId || store.personas[0]?.id;
            const chat = {id: uid(), botId: bot.id, personaId, createdAt: Date.now(), messages: []};
            const greetings = [bot.greeting, ...(bot.altGreetings || [])].filter(g => g && g.trim());
            if (greetings.length) chat.messages.push({id: uid(), role: "bot", swipes: greetings, swipeIndex: 0, ts: Date.now(), greeting: true});
            store.saveChat(chat);
            return send(res, 200, chat);
        }
        if ((mm = p.match(/^\/api\/chats\/([a-f0-9]{16})(\/.*)?$/))) {
            const chat = store.getChat(mm[1]);
            if (!chat) return send(res, 404, {error: "Чат не найден"});
            const sub = mm[2] || "";
            if (sub === "" && m === "GET") {
                const pend = pending.get(chat.id);
                return send(res, 200, {...chat, pending: pend ? {text: "", thinking: pend.thinking, phase: pend.phase, startedAt: pend.startedAt, mode: pend.mode, targetId: pend.targetId} : null});
            }
            if (sub === "" && m === "DELETE") { store.deleteChat(chat.id); return send(res, 200, {ok: true}); }
            if (sub === "" && m === "PATCH") {
                const body = await readBody(req);
                if (body.personaId && store.personas.some(x => x.id === body.personaId)) chat.personaId = body.personaId;
                if (body.settings && typeof body.settings === "object") {
                    const b = body.settings, cs = chat.settings || {};
                    if ("notes" in b) cs.notes = String(b.notes || "").slice(0, NOTES_LIMIT);
                    if ("memoryMessages" in b) cs.memoryMessages = b.memoryMessages == null || b.memoryMessages === "" ? null : Math.max(0, Math.min(1000, parseInt(b.memoryMessages) || 0));
                    if ("style" in b) cs.style = styleDef(store.settings, b.style) ? b.style : null;
                    if ("length" in b) cs.length = LENGTHS[b.length] ? b.length : null;
                    chat.settings = cs;
                }
                store.saveChat(chat);
                return send(res, 200, chat);
            }
            if (sub === "/summarize" && m === "POST") {
                try { return send(res, 200, {notes: await summarize(chat)}); }
                catch (e) { return send(res, 409, {error: String(e?.message || e)}); }
            }
            if (sub === "/generate" && m === "POST") {
                const body = await readBody(req);
                return generate(req, res, chat, body.mode || "send", body.text || "");
            }
            let sm;
            if ((sm = sub.match(/^\/messages\/([a-f0-9]{16})$/))) {
                const idx = chat.messages.findIndex(x => x.id === sm[1]);
                if (idx < 0) return send(res, 404, {error: "Сообщение не найдено"});
                const msg = chat.messages[idx];
                if (m === "PATCH") {
                    const body = await readBody(req);
                    if (typeof body.text === "string") {
                        if (msg.role === "user") msg.text = body.text;
                        else msg.swipes[msg.swipeIndex ?? 0] = body.text;
                    }
                    if (typeof body.swipeIndex === "number" && msg.swipes) {
                        msg.swipeIndex = Math.max(0, Math.min(msg.swipes.length - 1, body.swipeIndex));
                    }
                    store.saveChat(chat);
                    return send(res, 200, chat);
                }
                if (m === "DELETE") {
                    // удаляем сообщение и всё, что после него (как «откат» истории)
                    const after = url.searchParams.get("after") === "1";
                    if (after) chat.messages.splice(idx);
                    else chat.messages.splice(idx, 1);
                    store.saveChat(chat);
                    return send(res, 200, chat);
                }
            }
        }

        return send(res, 404, {error: "Нет такого метода"});
    }

    function sanitizeBot(b) {
        const s = (v, n = 20000) => String(v ?? "").slice(0, n);
        return {
            id: b.id, createdAt: b.createdAt || Date.now(), updatedAt: Date.now(),
            name: s(b.name, 80) || "Без имени",
            tagline: s(b.tagline, 200),
            avatar: typeof b.avatar === "string" && b.avatar.startsWith("data:image/") ? b.avatar : null,
            color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#8b5cf6",
            tags: Array.isArray(b.tags) ? b.tags.map(t => s(t, 30)).filter(Boolean).slice(0, 8) : [],
            description: s(b.description), personality: s(b.personality), scenario: s(b.scenario),
            greeting: s(b.greeting), altGreetings: Array.isArray(b.altGreetings) ? b.altGreetings.map(x => s(x)).filter(Boolean).slice(0, 20) : [],
            examples: s(b.examples), rules: s(b.rules)
        };
    }
    function sanitizeLore(b) {
        const keys = (Array.isArray(b.keys) ? b.keys : String(b.keys || "").split(","))
            .map(k => String(k).trim().slice(0, 60)).filter(Boolean).slice(0, 12);
        return {
            id: b.id, createdAt: b.createdAt || Date.now(), updatedAt: Date.now(),
            keys: [...new Set(keys)],
            content: String(b.content || "").trim().slice(0, 1500),
            botId: store.bots.some(x => x.id === b.botId) ? b.botId : null,
            enabled: b.enabled !== false,
            always: !!b.always,
            source: b.source ? String(b.source).slice(0, 300) : null
        };
    }
    function sanitizePersona(b) {
        return {
            id: b.id, createdAt: b.createdAt || Date.now(),
            name: String(b.name || "").slice(0, 80) || "Я",
            avatar: typeof b.avatar === "string" && b.avatar.startsWith("data:image/") ? b.avatar : null,
            description: String(b.description || "").slice(0, 8000)
        };
    }

    function serveStatic(req, res, url) {
        let rel = decodeURIComponent(url.pathname);
        if (rel === "/" || !path.extname(rel)) rel = "/index.html";
        const file = path.normalize(path.join(staticDir, rel));
        if (!file.startsWith(path.normalize(staticDir))) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); return res.end("Not found"); }
            res.writeHead(200, {"Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache"});
            res.end(data);
        });
    }

    async function handler(req, res) {
        const url = new URL(req.url, "http://x");
        try {
            if (url.pathname.startsWith("/api/")) await api(req, res, url);
            else serveStatic(req, res, url);
        } catch (e) {
            log("API error", e);
            if (!res.headersSent) send(res, 500, {error: String(e?.message || e)});
            else try { res.end(); } catch {}
        }
    }

    function listen(h, prt) {
        return new Promise((resolve, reject) => {
            const s = http.createServer(handler);
            s.keepAliveTimeout = 65000;
            s.requestTimeout = 0;
            s.once("error", reject);
            s.listen(prt, h, () => { s.off("error", reject); resolve(s); });
        });
    }

    async function bind() {
        host = store.settings.lanEnabled ? "0.0.0.0" : "127.0.0.1";
        let lastErr;
        for (let i = 0; i < 20; i++) {
            try {
                server = await listen(host, port + i);
                port = port + i;
                return;
            } catch (e) { lastErr = e; if (e.code !== "EADDRINUSE") throw e; }
        }
        throw lastErr;
    }

    async function rebind() {
        const wantHost = store.settings.lanEnabled ? "0.0.0.0" : "127.0.0.1";
        if (wantHost === host && server) return;
        await new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); });
        server = null;
        await bind();
        log(`Lumina: сервер перезапущен на ${host}:${port}`);
    }

    await bind();
    warmUpSpell();
    log(`Lumina: http://127.0.0.1:${port}  (доступ по сети: ${store.settings.lanEnabled ? "вкл" : "выкл"})`);

    if (store.settings.autoLoadModel && store.settings.lastModelPath && (mock || fs.existsSync(store.settings.lastModelPath))) {
        loadModel(store.settings.lastModelPath);
    }

    return {
        get port() { return port; },
        store, engine,
        addModel(p) {
            const abs = path.resolve(p);
            if (!store.settings.models.includes(abs)) store.settings.models.push(abs);
            store.saveSettings();
        },
        async close() {
            await engine.unload().catch(() => {});
            await new Promise(r => server ? server.close(() => r()) : r());
        }
    };
}

// Запуск без Electron: node server/server.mjs [--data ./data] [--mock]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const di = args.indexOf("--data");
    const dataDir = path.resolve(di >= 0 ? args[di + 1] : path.join(__dirname, "..", "data"));
    startServer({dataDir, mock: args.includes("--mock")}).catch(e => { console.error(e); process.exit(1); });
}
