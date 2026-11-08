// Офлайн-проверка русской орфографии (Hunspell через WebAssembly + словарь dictionary-ru).
// Находит слова с ошибками; самые очевидные опечатки исправляет сразу, остальные передаёт модели на проверку.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
let hun = null, loading = null;

async function load() {
    if (hun) return hun;
    if (!loading) loading = (async () => {
        // у dictionary-ru закрыт доступ к package.json через exports — берём папку по главному файлу пакета
        const dir = path.dirname(require.resolve("dictionary-ru"));
        const {loadModule} = require("hunspell-asm");
        const factory = await loadModule();
        const aff = factory.mountBuffer(fs.readFileSync(path.join(dir, "index.aff")), "ru.aff");
        const dic = factory.mountBuffer(fs.readFileSync(path.join(dir, "index.dic")), "ru.dic");
        hun = factory.create(aff, dic);
        return hun;
    })().catch(e => { loading = null; throw e; });
    return loading;
}
/** Заранее загрузить словарь (чтобы первый ответ не ждал). */
export function warmUp() { load().catch(e => console.error("spell", e?.message || e)); }

function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({length: m + 1}, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
}

const WORD = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;

/**
 * Проверяет текст. known — слова, которые точно не ошибки (имена, термины из словаря, слова собеседника).
 * Возвращает {fixed, autoFixed: [[было, стало]], suspicious: [{word, suggestions}]}.
 */
export async function spellCheck(text, known = new Set()) {
    const h = await load();
    const seen = new Map();
    for (const m of String(text).matchAll(WORD)) {
        const w = m[0];
        if (w.length < 3 || seen.has(w)) continue;
        const lw = w.toLowerCase();
        if (known.has(lw)) continue;
        // слово с заглавной не в начале предложения — скорее имя собственное, не трогаем
        const before = text.slice(Math.max(0, m.index - 3), m.index);
        const sentenceStart = m.index === 0 || /[.!?…—\n*(«"]\s*$/.test(before);
        if (w[0] !== w[0].toLowerCase() && !sentenceStart) continue;
        const parts = w.split("-");
        if (parts.every(p => p.length < 3 || h.spell(p)) || h.spell(w) || h.spell(lw)) continue;
        seen.set(w, (h.suggest(w) || []).slice(0, 3));
    }
    let fixed = String(text);
    const autoFixed = [], suspicious = [];
    for (const [w, sug] of seen) {
        const best = sug[0];
        // безопасная автозамена: одна буква разницы, то же начало, не короткое слово
        if (best && w.length >= 5 && !best.includes(" ") && lev(w.toLowerCase(), best.toLowerCase()) === 1 && w[0].toLowerCase() === best[0].toLowerCase()) {
            const rep = w[0] === w[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best;
            fixed = fixed.replace(new RegExp(`(^|[^А-Яа-яЁё-])${w}(?=[^А-Яа-яЁё-]|$)`, "g"), `$1${rep}`);
            autoFixed.push([w, rep]);
        } else suspicious.push({word: w, suggestions: sug});
    }
    return {fixed, autoFixed, suspicious};
}

/** Слова, которые не надо считать ошибками: из имён, описаний персонажа, персоны, словаря и сообщения собеседника. */
export function knownWords(...texts) {
    const s = new Set();
    for (const t of texts) for (const m of String(t || "").matchAll(WORD)) s.add(m[0].toLowerCase());
    return s;
}
