// Обёртка над node-llama-cpp: загрузка GGUF-модели и генерация ответов со стримингом.
import path from "node:path";
import fs from "node:fs";

export class Engine {
    constructor({mock = false} = {}) {
        this.mock = mock;
        this.llama = null;
        this.model = null;
        this.context = null;
        this.session = null;
        this.modelPath = null;
        this.status = "idle"; // idle | loading | ready | error
        this.progress = 0;
        this.error = null;
        this.gpu = null;
        this.busy = false;
        this.abort = null;
        this.listeners = new Set();
        this._loadToken = 0;
    }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { for (const fn of this.listeners) try { fn(this.info()); } catch {} }

    info() {
        return {
            status: this.status,
            progress: this.progress,
            error: this.error,
            modelPath: this.modelPath,
            modelName: this.modelPath ? path.basename(this.modelPath) : null,
            gpu: this.gpu,
            contextSize: this.context?.contextSize ?? null,
            busy: this.busy
        };
    }

    async getLlama(gpu) {
        if (this.llama && this._llamaGpu === gpu) return this.llama;
        const {getLlama} = await import("node-llama-cpp");
        try {
            this.llama = await getLlama({gpu: gpu === "auto" ? "auto" : gpu === "cpu" ? false : gpu, build: "never"});
        } catch (e) {
            // если выбранный бэкенд не поднялся — откатываемся на процессор
            this.llama = await getLlama({gpu: false, build: "never"});
        }
        this._llamaGpu = gpu;
        this.gpu = this.llama.gpu || "cpu";
        return this.llama;
    }

    async unload() {
        this._loadToken++;
        if (this.abort) this.abort.abort();
        try { this.session?.dispose(); } catch {}
        try { await this.context?.dispose(); } catch {}
        try { await this.model?.dispose(); } catch {}
        this.session = this.context = this.model = null;
        this.modelPath = null;
        this.status = "idle";
        this.progress = 0;
        this.error = null;
        this.emit();
    }

    async load(modelPath, {contextSize = 8192, gpu = "auto"} = {}) {
        await this.unload();
        const token = ++this._loadToken;
        this.status = "loading";
        this.modelPath = modelPath;
        this.progress = 0;
        this.emit();

        if (this.mock) {
            for (let i = 1; i <= 10; i++) {
                await sleep(80);
                if (token !== this._loadToken) return;
                this.progress = i / 10; this.emit();
            }
            this.gpu = "mock";
            this.status = "ready";
            this.emit();
            return;
        }

        try {
            if (!fs.existsSync(modelPath)) throw new Error("Файл модели не найден: " + modelPath);
            const llama = await this.getLlama(gpu);
            // Модель может почти целиком занять видеопамять, и тогда под контекст места не остаётся
            // («A context size of 1024 is too large for the available VRAM»). Поэтому:
            // 1) при загрузке заранее резервируем VRAM под рабочий контекст (fitContext);
            // 2) если контекст всё равно не создаётся — перезагружаем модель с меньшим числом слоёв на видеокарте
            //    (остальные уйдут в оперативную память: медленнее, но работает), вплоть до чистого процессора.
            const fitCtx = Math.min(contextSize, 8192);
            const {LlamaChatSession, resolveChatWrapper, QwenChatWrapper} = await import("node-llama-cpp");
            let model = null, context = null, gpuLayers = {fitContext: {contextSize: fitCtx}}, lastErr = null;
            for (let attempt = 0; attempt < 6 && !context; attempt++) {
                this.progress = 0; this.emit();
                try {
                    model = await llama.loadModel({
                        modelPath,
                        gpuLayers,
                        onLoadProgress: (p) => { this.progress = p; this.emit(); }
                    });
                } catch (e) {
                    lastErr = e;
                    if (gpuLayers === 0) throw e;
                    gpuLayers = typeof gpuLayers === "number" ? Math.floor(gpuLayers / 2) : 0;
                    continue;
                }
                if (token !== this._loadToken) { await model.dispose(); return; }
                for (const opts of [
                    {contextSize: {min: 2048, max: contextSize}, flashAttention: true},
                    {contextSize: {min: 1024, max: Math.min(contextSize, 4096)}, flashAttention: true},
                    {contextSize: {min: 1024, max: Math.min(contextSize, 4096)}}
                ]) {
                    try { context = await model.createContext(opts); break; } catch (e) { lastErr = e; }
                }
                if (context) break;
                const was = model.gpuLayers;
                await model.dispose().catch(() => {});
                model = null;
                if (was === 0) break;
                gpuLayers = Math.max(0, Math.floor(was * 0.6));
                console.warn(`Lumina: не хватило видеопамяти под контекст, пробую ${gpuLayers} слоёв на видеокарте`);
            }
            if (!context) throw lastErr || new Error("Не удалось создать контекст модели");
            this.gpuLayers = model.gpuLayers;
            if (token !== this._loadToken) { await context.dispose(); await model.dispose(); return; }
            this.model = model;
            this.context = context;
            // «Думающие» модели (Qwen3 и др.) тратят лимит токенов на скрытые рассуждения,
            // и видимый ответ получается пустым. Для ролевого чата рассуждения отключаем.
            let chatWrapper = "auto";
            try {
                const w = resolveChatWrapper(model);
                if (w instanceof QwenChatWrapper) chatWrapper = new QwenChatWrapper({thoughts: "discourage", variation: w.variation});
                else if (w) chatWrapper = w;
            } catch {}
            this.session = new LlamaChatSession({contextSequence: context.getSequence(), chatWrapper});
            this.status = "ready";
            this.progress = 1;
            this.emit();
        } catch (e) {
            if (token !== this._loadToken) return;
            console.error(e);
            this.status = "error";
            this.error = String(e?.message || e);
            this.modelPath = modelPath;
            this.emit();
            throw e;
        }
    }

    stop() {
        if (this.abort) this.abort.abort();
    }

    /**
     * history: [{role: "system"|"user"|"bot", text}] — последний элемент должен быть user
     * (или history заканчивается bot-сообщением при "продолжить").
     */
    async generate({system, history, params, stopWords = [], onText, onThinking, timeoutMs = 0}) {
        if (this.status !== "ready") throw new Error("Модель не загружена");
        if (this.busy) throw new Error("Модель занята другим ответом");
        this.busy = true;
        this.emit();
        const abort = new AbortController();
        this.abort = abort;
        this.lastAborted = false;
        this.timedOut = false;
        // лимит времени: по истечении обрываем генерацию, но это не «Стоп» пользователя
        const timer = timeoutMs > 0 ? setTimeout(() => { this.timedOut = true; abort.abort(); }, timeoutMs) : null;
        try {
            if (this.mock) return await this._mockGenerate(history, abort, onText);

            const msgs = history.slice();
            let promptText = "";
            if (msgs.length && msgs[msgs.length - 1].role === "user") promptText = msgs.pop().text;

            const chatHistory = [{type: "system", text: system}];
            for (const m of msgs) {
                const prev = chatHistory[chatHistory.length - 1];
                if (m.role === "user") {
                    if (prev.type === "user") prev.text += "\n\n" + m.text;
                    else chatHistory.push({type: "user", text: m.text});
                } else {
                    if (prev.type === "model") prev.response[0] += "\n\n" + m.text;
                    else chatHistory.push({type: "model", response: [m.text]});
                }
            }
            this.session.setChatHistory(chatHistory);

            let thinkingSent = false;
            const text = await this.session.prompt(promptText, {
                signal: abort.signal,
                stopOnAbortSignal: true,
                maxTokens: params.maxTokens || 400,
                temperature: params.temperature,
                minP: params.minP,
                topP: params.topP,
                topK: params.topK,
                // Классический штраф за повторы бьёт по отдельным токенам — в русском это окончания и короткие слова,
                // отсюда искажённые слова. Поэтому держим его мягким, а повторы целых фраз гасим через DRY.
                repeatPenalty: (params.repeatPenalty || 1) > 1.001 ? {
                    penalty: Math.min(params.repeatPenalty, 1.2),
                    lastTokens: 64,
                    frequencyPenalty: 0,
                    presencePenalty: 0
                } : false,
                ...(params.dryStrength > 0 ? {dryRepeatPenalty: {
                    strength: Math.min(1, params.dryStrength),
                    base: 1.75,
                    allowedLength: 3,
                    lastTokens: 2048,
                    sequenceBreakers: ["\n", ":", "\"", "*", "—", "((", "))"]
                }} : {}),
                customStopTriggers: stopWords.filter(Boolean),
                budgets: {thoughtTokens: params.allowThinking ? 1024 : 0},
                onTextChunk: (chunk) => onText?.(chunk),
                onResponseChunk: (chunk) => {
                    if (chunk.type === "segment" && !thinkingSent) {
                        thinkingSent = true;
                        onThinking?.();
                    }
                }
            });
            return text;
        } finally {
            if (timer) clearTimeout(timer);
            this.lastAborted = abort.signal.aborted && !this.timedOut; // остановлено пользователем
            this.busy = false;
            this.abort = null;
            this.emit();
        }
    }

    async _mockGenerate(history, abort, onText) {
        const last = history.filter(m => m.role === "user").pop()?.text || "";
        const reply = `*задумчиво склоняет голову* Ты сказал: «${last.slice(0, 80)}». Это тестовый режим без модели — но интерфейс работает. *улыбается* Что дальше?`;
        let out = "";
        for (const w of reply.split(/(\s+)/)) {
            if (abort.signal.aborted) break;
            await sleep(25);
            out += w;
            onText?.(w);
        }
        return out;
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
