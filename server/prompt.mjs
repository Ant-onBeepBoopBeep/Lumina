// Сборка системного промпта из профиля бота и персоны пользователя.
import {currentText} from "./store.mjs";

// Минимальная длина любого ответа бота (общее правило для всех чатов).
export const MIN_CHARS_FLOOR = 450;
export const NOTES_LIMIT = 1500;

// Длина ответа: подсказка для модели + лимит токенов (≈ 2,5–3 символа кириллицы на токен).
export const LENGTHS = {
    short:  {label: "Короткие",       hint: "1–2 абзаца, примерно 450–700 символов",    tokens: 450},
    medium: {label: "Средние",        hint: "2–4 абзаца, примерно 700–1200 символов",   tokens: 750},
    long:   {label: "Длинные",        hint: "4–6 абзацев, примерно 1200–2000 символов", tokens: 1100},
    xlong:  {label: "Очень длинные",  hint: "6–9 абзацев, примерно 2000–3000 символов", tokens: 1600}
};

// Стили оформления ответа.
// Разметка блоков, которую понимает интерфейс:
//   *действие / описание*      — блок действия
//   — реплика (с новой строки)  — блок речи
//   ((мысли))                  — блок мыслей
export const THOUGHTS_RULE = `Мысли {{char}} пиши отдельным блоком в двойных круглых скобках: ((Он знает про семью… Кто ему сказал?)). Мысли — то, что {{char}} думает, но не произносит вслух.`;
export const NO_THOUGHTS_RULE = `Не показывай мысли {{char}} — только действия, описания и речь.`;

export const STYLES = {
    universal: {
        label: "Универсальный (блоки)",
        rules: `Формат ответа — отдельные блоки. Каждый блок с новой строки, между блоками пустая строка. Не смешивай разные типы в одном блоке.
- Действия, жесты, мимика и описание обстановки — в звёздочках: *Кирара медленно опускается на бетон напротив, поправляя юбку.*
- Реплики — с новой строки, начиная с тире: — Ты… откуда ты это знаешь?
Чередуй блоки действий и реплик (и мыслей, если они разрешены). Описания делай живыми и подробными.`,
        example: `*Кирара застыла. Сигарета дымилась в его пальцах; он сидел на бетоне, спиной к ограждению, так, словно это была его территория.*

— Семья… — выдохнула она. — Ты… откуда?

((Он знает. Про семью. Кто ему сказал? Футаба? Нет, она не знает…))

*Она опустилась напротив него. Юбка расстелилась по бетону, ноги подогнуты, взгляд настороженный.*

— Корпоративная, — усмехнулась она. — Да. Что-то вроде того.`
    },
    book3: {
        label: "Книга: от третьего лица",
        rules: `Пиши как художественную книгу: повествование от третьего лица в прошедшем времени. Подробно описывай действия персонажа {{char}}, его мимику, жесты, ощущения и окружение. Прямую речь оформляй как в книгах — с новой строки через тире. Разделяй текст на абзацы пустой строкой. Не используй звёздочки.`,
        example: `Лира медленно отложила лютню и, не сводя с собеседника внимательного взгляда, опустилась на скамью напротив. Пламя свечи дрогнуло, бросив на её лицо тёплые блики, и в зелёных глазах мелькнула едва заметная насмешка.

— Ты единственный, кто не хлопал, — негромко произнесла она, подперев подбородок ладонью. — Либо у тебя совсем нет слуха, либо тебе есть что рассказать.

За окном шумел дождь, и где-то в глубине зала звякнули кружки. Лира чуть подалась вперёд, будто боялась пропустить ответ.`
    },
    book1: {
        label: "Книга: от первого лица",
        rules: `Пиши как художественную книгу от первого лица — от имени {{char}}, в прошедшем времени. Передавай мысли, чувства и наблюдения рассказчика, подробно описывай действия и окружение. Прямую речь оформляй с новой строки через тире. Разделяй текст на абзацы пустой строкой. Не используй звёздочки.`,
        example: `Я отложила лютню и, сама не зная зачем, направилась к его столу. В таверне пахло дымом и мокрой шерстью, а он сидел так, будто весь этот шум его не касался.

— Ты единственный, кто не хлопал, — сказала я, усаживаясь напротив. — Это обидно, знаешь ли.

Он поднял на меня глаза, и мне вдруг стало любопытно, что за история прячется за этим усталым взглядом.`
    },
    rp: {
        label: "Ролевой: *действия* и речь",
        rules: `Действия и описания выделяй звёздочками: *улыбается и садится рядом*. Прямую речь пиши обычным текстом без кавычек. Чередуй развёрнутые описания действий и реплики, разделяй абзацы пустой строкой.`,
        example: `*Лира откладывает лютню и под аплодисменты пересекает зал. Без приглашения садится напротив, подпирает подбородок ладонью и с любопытством разглядывает собеседника.*

Ты единственный, кто не хлопал. Либо у тебя нет слуха, либо тебе есть что рассказать поинтереснее моих баллад.

*Она придвигает к нему кружку и чуть наклоняет голову, ожидая ответа.*`
    }
};

export function macros(text, charName, userName) {
    return String(text || "")
        .replace(/\{\{char\}\}|<BOT>/gi, charName)
        .replace(/\{\{user\}\}|<USER>/gi, userName);
}

/** Описание стиля по ключу: встроенный или свой (ключ "c:<id>"). */
export function styleDef(settings, key) {
    if (STYLES[key]) return STYLES[key];
    if (typeof key === "string" && key.startsWith("c:")) {
        const c = (settings.customStyles || []).find(x => "c:" + x.id === key);
        if (c) return {label: c.label, rules: c.rules || "", example: c.example || "", custom: true};
    }
    return null;
}

/** Итоговые параметры ответа для чата: общие настройки + переопределения чата. */
export function resolveChatOptions(settings, chat) {
    const cs = chat?.settings || {};
    const length = LENGTHS[cs.length] ? cs.length : (LENGTHS[settings.responseLength] ? settings.responseLength : "medium");
    const style = styleDef(settings, cs.style) ? cs.style : (styleDef(settings, settings.style) ? settings.style : "universal");
    const mem = Number.isInteger(cs.memoryMessages) ? cs.memoryMessages : (settings.memoryMessages | 0);
    return {
        length, style,
        styleDef: styleDef(settings, style),
        thoughts: settings.showThoughts !== false,
        minChars: Math.max(MIN_CHARS_FLOOR, settings.minChars | 0),
        memoryMessages: Math.max(0, mem),
        notes: String(cs.notes || "").slice(0, NOTES_LIMIT).trim(),
        maxTokens: LENGTHS[length].tokens
    };
}

export function buildSystem(template, bot, persona, opts = null) {
    const char = bot.name || "Персонаж";
    const user = persona?.name || "Пользователь";

    const botParts = [];
    if (bot.description) botParts.push(`[Кто такой ${char}]\n${bot.description}`);
    if (bot.personality) botParts.push(`[Характер ${char}]\n${bot.personality}`);
    if (bot.scenario) botParts.push(`[Сценарий]\n${bot.scenario}`);
    if (bot.rules) botParts.push(`[Особые указания]\n${bot.rules}`);
    if (bot.examples) botParts.push(`[Примеры того, как говорит ${char}]\n${bot.examples}`);

    const personaPart = persona?.description
        ? `[О собеседнике — ${user}]\n${persona.description}`
        : "";

    let out = template || "";
    if (!out.includes("{{bot}}")) out += "\n\n{{bot}}";
    if (!out.includes("{{persona}}")) out += "\n\n{{persona}}";
    out = out.replace("{{bot}}", botParts.join("\n\n")).replace("{{persona}}", personaPart);

    if (opts) {
        if (opts.notes) {
            out += `\n\n[Важный контекст истории — всегда опирайся на него]\n${opts.notes}`;
        }
        const st = opts.styleDef || STYLES[opts.style];
        const fmt = [];
        if (st?.rules) fmt.push(st.rules);
        fmt.push(opts.thoughts ? (BOOK_STYLES.has(opts.style) ? BOOK_THOUGHTS_RULE : THOUGHTS_RULE) : NO_THOUGHTS_RULE);
        fmt.push(`Пиши грамотным литературным русским языком: правильные падежи, согласование, без выдуманных слов.`);
        fmt.push(`Длина ответа: ${LENGTHS[opts.length].hint}.`);
        fmt.push(`ОБЯЗАТЕЛЬНОЕ ПРАВИЛО: каждый ответ должен содержать не менее ${opts.minChars} символов. Короткие ответы запрещены — раскрывай действия, эмоции, детали и окружение.`);
        fmt.push(`Всегда пиши содержательный ответ. Никогда не оставляй ответ пустым.`);
        out += `\n\n[Оформление ответа]\n${fmt.join("\n")}`;
        let ex = st ? st.example : "";
        if (ex && !opts.thoughts) ex = ex.replace(/^\(\([\s\S]*?\)\)\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
        if (ex) out += `\n\n[Пример оформления ответа — следуй этой манере, но не копируй содержание]\n${ex}`;
    }
    return macros(out, char, user).replace(/\n{3,}/g, "\n\n").trim();
}

/** Короткое напоминание, которое добавляется к последнему сообщению пользователя (только для модели). */
// Стили «как книга» пишутся без звёздочек — им нужны свои правила для мыслей, иначе указания противоречат друг другу.
const BOOK_STYLES = new Set(["book1", "book3"]);
const BOOK_THOUGHTS_RULE = `Мысли {{char}} можно давать отдельным абзацем в двойных круглых скобках: ((Он знает… Кто ему сказал?)). Звёздочки не используй.`;

export function reminderFor(opts, userName = "собеседник") {
    const st = opts.styleDef || STYLES[opts.style];
    const marks = opts.style === "universal"
        ? `блоки: *действия*, — реплики${opts.thoughts ? ", ((мысли))" : ""}; `
        : BOOK_STYLES.has(opts.style)
            ? `стиль «${st.label}», без звёздочек${opts.thoughts ? ", мысли в ((скобках))" : ""}; `
            : (st ? `стиль «${st.label}»${opts.thoughts ? ", мысли в ((скобках))" : ""}; ` : "");
    // модели 7–14B хуже всего держат ближайший контекст — явно просим ответить именно на это сообщение
    return `\n\n(Напоминание для ответа: отреагируй именно на это сообщение ${userName} — на его слова и действия, продолжая сцену с того места, где она сейчас. Помни, что произошло в предыдущих сообщениях. ${marks}${LENGTHS[opts.length].hint}, не меньше ${opts.minChars} символов. Пиши грамотно. Не пиши за ${userName}.)`;
}

export function chatToHistory(chat, bot, persona, uptoIndex = chat.messages.length, limit = 0) {
    const char = bot.name || "Персонаж";
    const user = persona?.name || "Пользователь";
    let msgs = chat.messages.slice(0, uptoIndex);
    if (limit > 0 && msgs.length > limit) msgs = msgs.slice(-limit);
    return msgs.map(m => ({
        role: m.role === "user" ? "user" : "bot",
        text: macros(currentText(m), char, user)
    })).filter(m => m.text.trim());
}

export function stopWordsFor(bot, persona) {
    const user = persona?.name || "Пользователь";
    return [`\n${user}:`, `\n*${user}:`, `\n[${user}]`];
}
