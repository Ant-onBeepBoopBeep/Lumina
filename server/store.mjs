// Простое файловое хранилище на JSON с атомарной записью.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function uid() {
    return crypto.randomBytes(8).toString("hex");
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), "utf8");
    fs.renameSync(tmp, file);
}

const OLD_DEFAULT_TEMPLATE = `Это вымышленная интерактивная ролевая история. Ты играешь роль персонажа {{char}}, а пользователь играет за {{user}}.

Правила:
- Всегда оставайся в образе {{char}}. Не упоминай, что ты ИИ или языковая модель.
- Пиши только за {{char}} и окружающий мир. Никогда не пиши реплики и действия за {{user}}.
- Действия и описания выделяй звёздочками: *улыбается и садится рядом*. Прямую речь пиши обычным текстом.
- Будь живым и инициативным: развивай сюжет, проявляй эмоции, реагируй на детали.
- Отвечай на том языке, на котором пишет {{user}}.

{{bot}}

{{persona}}`;

export const DEFAULT_SYSTEM_TEMPLATE = `Это вымышленная интерактивная ролевая история. Ты играешь роль персонажа {{char}}, а пользователь играет за {{user}}.

Правила:
- Всегда оставайся в образе {{char}}. Не упоминай, что ты ИИ или языковая модель.
- Пиши только за {{char}} и окружающий мир. Никогда не пиши реплики и действия за {{user}}.
- Опирайся на всю предыдущую историю: помни имена, события, обещания и детали.
- Будь живым и инициативным: развивай сюжет, проявляй эмоции, реагируй на детали.
- Отвечай на том языке, на котором пишет {{user}}.

{{bot}}

{{persona}}`;

export const DEFAULT_SETTINGS = {
    port: 3737,
    lanEnabled: false,
    pin: null,
    autoLoadModel: true,
    lastModelPath: null,
    models: [],
    contextSize: 8192,
    gpu: "auto",
    temperature: 0.8,
    minP: 0.08,
    topP: 0.95,
    topK: 40,
    repeatPenalty: 1.03,
    maxTokens: 750,
    responseLength: "medium",   // short | medium | long | xlong
    style: "universal",         // universal | book3 | book1 | rp | c:<id> (свой стиль)
    showThoughts: true,         // показывать мысли персонажа ((…))
    customStyles: [],           // свои стили: {id, label, rules, example}
    formatVersion: 2,
    minChars: 450,              // минимум символов в ответе (не меньше 450)
    memoryMessages: 0,          // 0 = помнить всю переписку, сколько влезет в контекст
    allowThinking: false,
    systemTemplate: DEFAULT_SYSTEM_TEMPLATE,
    defaultPersonaId: null,
    closeToTray: true,
    samplerPreset: "balanced",  // stable | balanced | creative | custom
    dryStrength: 0.8,           // DRY: гасит повторы целых фраз, не ломая слова (0 — выкл)
    spellCheck: true,           // офлайн-проверка орфографии словарём перед отправкой
    replyTimeLimit: 60,         // сек: за это время ответ должен быть написан, проверен и отправлен
    replyReview: true,          // проверять черновик на логику и орфографию перед отправкой
    desktopNotify: true,        // уведомление Windows, когда окно Lumina не в фокусе
    ntfyEnabled: false,         // push на телефон через приложение ntfy
    ntfyServer: "https://ntfy.sh",
    ntfyTopic: null,
    ntfyWithText: false         // показывать начало ответа в уведомлении
};

// Проверенные наборы параметров генерации (для моделей 7–14B, русский язык).
export const SAMPLER_PRESETS = {
    stable:   {label: "Стабильный",       hint: "Меньше ошибок и неожиданностей, ровный стиль",            temperature: 0.6, minP: 0.1,  topP: 0.95, topK: 40, repeatPenalty: 1.0,  dryStrength: 0.8},
    balanced: {label: "Сбалансированный", hint: "Живо, но грамотно — рекомендуется",                        temperature: 0.8, minP: 0.08, topP: 0.95, topK: 40, repeatPenalty: 1.03, dryStrength: 0.8},
    creative: {label: "Творческий",       hint: "Неожиданнее и ярче, чуть больше ошибок",                   temperature: 1.0, minP: 0.06, topP: 0.97, topK: 60, repeatPenalty: 1.05, dryStrength: 0.8}
};
export function applyPreset(s, key) {
    const p = SAMPLER_PRESETS[key];
    if (!p) return;
    for (const k of ["temperature", "minP", "topP", "topK", "repeatPenalty", "dryStrength"]) s[k] = p[k];
    s.samplerPreset = key;
}

export class Store {
    constructor(dataDir) {
        this.dir = dataDir;
        this.chatsDir = path.join(dataDir, "chats");
        this.modelsDir = path.join(dataDir, "models");
        fs.mkdirSync(this.chatsDir, {recursive: true});
        fs.mkdirSync(this.modelsDir, {recursive: true});

        // счётчики изменений: клиенты сравнивают их и подтягивают свежие данные
        this.metaRev = Date.now();
        this.chatRev = Date.now();

        this.settingsFile = path.join(dataDir, "settings.json");
        this.botsFile = path.join(dataDir, "bots.json");
        this.personasFile = path.join(dataDir, "personas.json");
        this.authFile = path.join(dataDir, "auth.json");
        this.loreFile = path.join(dataDir, "lorebook.json");
        this.lore = readJson(this.loreFile, []);
        if (!Array.isArray(this.lore)) this.lore = [];

        const rawSettings = readJson(this.settingsFile, null);
        this.settings = {...DEFAULT_SETTINGS, ...(rawSettings || {})};
        if (this.settings.systemTemplate === OLD_DEFAULT_TEMPLATE) this.settings.systemTemplate = DEFAULT_SYSTEM_TEMPLATE;
        // переход на формат v2: универсальный стиль по умолчанию, свой пример → свой стиль
        if (rawSettings && (rawSettings.formatVersion | 0) < 2) {
            const s = this.settings;
            if (!Array.isArray(s.customStyles)) s.customStyles = [];
            if (String(s.styleExample || "").trim()) {
                const id = uid();
                s.customStyles.push({id, label: "Мой стиль", rules: "", example: String(s.styleExample).trim()});
                if (s.style === "custom") s.style = "c:" + id;
            }
            if (s.style === "book3" || s.style === "custom") s.style = "universal";
            delete s.styleExample;
            s.formatVersion = 2;
            writeJson(this.settingsFile, s);
        }
        // формат v3: вместо ручных значений — набор «Сбалансированный» (температура 1.6 и штраф за повторы 1.3+
        // ломали русскую орфографию). Если значения были разумными — сохраняем их как «Свой».
        if (rawSettings && (rawSettings.formatVersion | 0) < 3) {
            const s = this.settings;
            if (s.temperature > 1.2 || s.repeatPenalty > 1.15) applyPreset(s, "balanced");
            else s.samplerPreset = "custom";
            s.formatVersion = 3;
            writeJson(this.settingsFile, s);
        }
        if (!this.settings.pin) {
            this.settings.pin = String(crypto.randomInt(100000, 1000000));
            this.saveSettings();
        }
        if (!this.settings.ntfyTopic) {
            this.settings.ntfyTopic = "lumina-" + crypto.randomBytes(8).toString("hex");
            this.saveSettings();
        }
        this.bots = readJson(this.botsFile, null);
        this.personas = readJson(this.personasFile, null);
        this.auth = readJson(this.authFile, {tokens: []});

        if (this.bots == null) {
            this.bots = seedBots();
            this.saveBots();
        }
        if (this.personas == null) {
            const p = {id: uid(), name: "Путник", avatar: null, description: "", createdAt: Date.now()};
            this.personas = [p];
            this.settings.defaultPersonaId = p.id;
            this.savePersonas();
            this.saveSettings();
        }
    }

    saveSettings() { writeJson(this.settingsFile, this.settings); this.metaRev++; }
    saveBots() { writeJson(this.botsFile, this.bots); this.metaRev++; }
    savePersonas() { writeJson(this.personasFile, this.personas); this.metaRev++; }
    saveAuth() { writeJson(this.authFile, this.auth); }
    saveLore() { writeJson(this.loreFile, this.lore); this.metaRev++; }

    // ---- чаты ----
    chatFile(id) {
        if (!/^[a-f0-9]{16}$/.test(id)) throw new Error("bad id");
        return path.join(this.chatsDir, id + ".json");
    }
    getChat(id) {
        return readJson(this.chatFile(id), null);
    }
    saveChat(chat) {
        chat.updatedAt = Date.now();
        writeJson(this.chatFile(chat.id), chat);
        this.chatRev++;
    }
    deleteChat(id) {
        try { fs.unlinkSync(this.chatFile(id)); } catch {}
        this.chatRev++;
    }
    listChats() {
        const out = [];
        for (const f of fs.readdirSync(this.chatsDir)) {
            if (!f.endsWith(".json")) continue;
            const c = readJson(path.join(this.chatsDir, f), null);
            if (!c) continue;
            const last = c.messages[c.messages.length - 1];
            out.push({
                id: c.id, botId: c.botId, personaId: c.personaId,
                createdAt: c.createdAt, updatedAt: c.updatedAt,
                count: c.messages.length,
                last: last ? {role: last.role, text: currentText(last).slice(0, 160)} : null
            });
        }
        out.sort((a, b) => b.updatedAt - a.updatedAt);
        return out;
    }
}

export function currentText(msg) {
    if (msg.swipes && msg.swipes.length) return msg.swipes[msg.swipeIndex ?? 0] ?? "";
    return msg.text ?? "";
}

function seedBots() {
    const now = Date.now();
    return [
        {
            id: uid(), createdAt: now, avatar: null, color: "#8b5cf6",
            name: "Лира",
            tagline: "Странствующая бардесса с тайной в прошлом",
            tags: ["фэнтези", "приключения"],
            description: "Лира — эльфийка-бардесса двадцати шести лет (по меркам эльфов — совсем юная). Серебристые волосы, заплетённые в косу, зелёные глаза, потёртая лютня за спиной.",
            personality: "Остроумная, любопытная, немного дерзкая. Обожает истории и легко заводит знакомства, но о своём прошлом говорит неохотно. Верна друзьям.",
            scenario: "Таверна «Хромой грифон» на перекрёстке торговых дорог. Поздний вечер, за окном дождь. Лира только что закончила выступление и замечает {{user}} за соседним столом.",
            greeting: "*Лира откладывает лютню, под аплодисменты пересекает зал и без приглашения садится напротив тебя.* Ты единственный, кто не хлопал. Либо у тебя нет слуха, либо тебе есть что рассказать поинтереснее моих баллад. *Она улыбается и придвигает к тебе кружку.* Ну, путник, удиви меня.",
            examples: "",
            rules: ""
        },
        {
            id: uid(), createdAt: now, avatar: null, color: "#06b6d4",
            name: "Мастер подземелий",
            tagline: "Ведущий текстовой ролевой игры",
            tags: ["игра", "рассказчик"],
            description: "Опытный рассказчик и ведущий настольных ролевых игр. Описывает мир, управляет всеми персонажами и событиями.",
            personality: "Справедливый, изобретательный, с хорошим чувством юмора. Поощряет смелые решения игрока, но последствия у них реальные.",
            scenario: "{{user}} — герой новой кампании. Мастер описывает мир, предлагает выбор и отыгрывает всех неигровых персонажей.",
            greeting: "Добро пожаловать за игровой стол! Прежде чем начнём, скажи: в каком мире ты хочешь оказаться — мрачное фэнтези, киберпанк, космос, постапокалипсис или что-то своё? И кто твой герой?",
            examples: "",
            rules: "Ты — ведущий (рассказчик), а не отдельный персонаж. Описывай мир от второго лица («ты видишь...»). В конце каждого ответа оставляй игроку пространство для действия."
        }
    ];
}
