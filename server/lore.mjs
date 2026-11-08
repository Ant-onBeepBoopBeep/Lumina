// Словарь (лорбук): термины и их значения, которые подставляются в промпт, когда слово встречается в переписке.
// И ручной поиск значения термина в интернете (Викисловарь, Википедия, DuckDuckGo) — только по запросу пользователя.

export const LORE_MAX_INJECT = 2000;   // сколько символов словаря максимум добавлять в промпт
export const LORE_SCAN_MESSAGES = 6;   // в скольких последних сообщениях искать термины

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ключ совпадает, если с него начинается слово: «академи» найдёт «Академия», «академии». */
function keyRegex(key) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(key.toLowerCase())}`, "u");
}

/** Какие записи словаря относятся к этому тексту (с учётом персонажа). */
export function matchLore(entries, text, botId) {
    const t = String(text || "").toLowerCase();
    const out = [];
    for (const e of entries || []) {
        if (e.enabled === false) continue;
        if (e.botId && e.botId !== botId) continue;
        if (e.always || (e.keys || []).some(k => k && keyRegex(k).test(t))) out.push(e);
    }
    return out;
}

/** Блок для системного промпта. */
export function loreBlock(entries) {
    if (!entries.length) return "";
    const lines = [];
    let size = 0;
    for (const e of entries) {
        const line = `- ${(e.keys || []).filter(Boolean).join(" / ") || "?"}: ${String(e.content || "").trim()}`;
        if (size + line.length > LORE_MAX_INJECT) break;
        lines.push(line);
        size += line.length;
    }
    return `[Словарь — значения терминов и сленга из этой истории. Используй их правильно, но не пересказывай словарь]\n${lines.join("\n")}`;
}

// ---------------- поиск значения в интернете ----------------
const UA = "Lumina/1.6 (local roleplay app)";
async function getJson(url, tries = 2) {
    for (let i = 0; ; i++) {
        try {
            const r = await fetch(url, {headers: {"User-Agent": UA, "Accept": "application/json"}, signal: AbortSignal.timeout(8000)});
            if (r.status === 404) return null;
            if (!r.ok) throw new Error("HTTP " + r.status);
            return await r.json();
        } catch (e) {
            if (i + 1 >= tries) throw e;
            await new Promise(res => setTimeout(res, 700)); // разовый сбой сети / ограничение частоты — пробуем ещё раз
        }
    }
}
const clip = (s, n = 700) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };

async function fromWiktionary(q) {
    const j = await getJson(`https://ru.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(q.toLowerCase())}`);
    const p = Object.values(j?.query?.pages || {})[0];
    if (!p || p.missing !== undefined || !p.extract) return null;
    // берём раздел «Значение» первой (русской) статьи
    const m = p.extract.match(/=+\s*Значение\s*=+\n([\s\S]*?)(\n=+|$)/);
    if (!m) return null;
    const defs = m[1].split("\n").map(l => l.split(" ◆ ")[0].trim()).filter(l => l && l !== "◆").slice(0, 4);
    if (!defs.length) return null;
    return {source: "Викисловарь", title: p.title, text: clip(defs.map((d, i) => `${i + 1}) ${d}`).join(" ")), url: `https://ru.wiktionary.org/wiki/${encodeURIComponent(p.title)}`};
}

async function fromWikipedia(q, lang = "ru") {
    const s = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&utf8=1&srsearch=${encodeURIComponent(q)}`);
    const title = s?.query?.search?.[0]?.title;
    if (!title) return null;
    const j = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (!j?.extract) return null;
    return {source: lang === "ru" ? "Википедия" : "Wikipedia (en)", title: j.title, text: clip(j.extract), url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`};
}

async function fromDuckDuckGo(q) {
    const j = await getJson(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(q)}`);
    const text = j?.AbstractText || j?.RelatedTopics?.find(t => t.Text)?.Text;
    if (!text) return null;
    return {source: "DuckDuckGo" + (j.AbstractSource ? ` · ${j.AbstractSource}` : ""), title: j.Heading || q, text: clip(text), url: j.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(q)}`};
}

/** Ищет термин в нескольких источниках параллельно; возвращает найденное (без пустых). */
export async function lookupTerm(q) {
    q = String(q || "").trim().slice(0, 100);
    if (!q) throw new Error("Пустой запрос");
    const latin = /^[\x00-\x7F\s]+$/.test(q);
    // латиница (senpai, simp, rizz…) — сначала англоязычные источники
    const tasks = latin
        ? [fromDuckDuckGo(q), fromWikipedia(q, "en"), fromWiktionary(q), fromWikipedia(q, "ru")]
        : [fromWiktionary(q), fromWikipedia(q, "ru"), fromDuckDuckGo(q)];
    const res = await Promise.allSettled(tasks);
    const found = res.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
    const failed = res.every(r => r.status === "rejected");
    if (failed) throw new Error("Нет связи с интернетом на компьютере");
    return found;
}
