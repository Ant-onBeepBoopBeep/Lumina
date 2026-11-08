// Перевод интерфейса Lumina (русский → английский).
// Интерфейс пишется по-русски; в режиме English этот слой на лету подменяет текст элементов,
// подсказки (title) и плейсхолдеры по словарю ниже. Переписка, карточки персонажей и всё,
// что вводит пользователь, не переводится.
(function () {
    const LANG_KEY = "lumina_lang";
    let lang = "ru";
    try { lang = localStorage.getItem(LANG_KEY) || "ru"; } catch {}

    const EN = {
        // --- навигация и общее ---
        "О персонаже": "About the character",
        "Редактирование": "Editing",
        "Загрузить": "Upload",
        "изображение": "image",
        "*{{char}} усмехается и откидывается на спинку стула.* — Та, кого ты точно не забудешь. ((Интересно, он правда меня не узнал?))": "*{{char}} smirks and leans back in the chair.* — Someone you definitely won’t forget. ((I wonder if he really didn’t recognize me?))",
        "кринж, кринжово": "cringe, cringey",
        "6–8 ГБ": "6–8 GB",
        "≈ 4–5,5 ГБ": "≈ 4–5.5 GB",
        "10–12 ГБ": "10–12 GB",
        "≈ 7–9 ГБ": "≈ 7–9 GB",
        "16 ГБ": "16 GB",
        "≈ 12–14 ГБ": "≈ 12–14 GB",
        "24 ГБ+": "24 GB+",
        "≈ 16–20 ГБ": "≈ 16–20 GB",
        "Персонажи": "Characters", "Чаты": "Chats", "Мои персоны": "My personas", "Персоны": "Personas",
        "Словарь": "Lorebook", "Модель": "Model", "Настройки": "Settings", "Ещё": "More",
        "Синхронизировать": "Sync", "Синхронизировать с другим устройством": "Sync with the other device",
        "Подтянуть изменения, сделанные на телефоне": "Pull changes made on the phone",
        "Синхронизировано: данные с компьютера и телефона совпадают": "Synced: PC and phone data match",
        "Открыть": "Open", "Закрыть": "Close", "Сохранить": "Save", "Отмена": "Cancel", "Удалить": "Delete",
        "Изменить": "Edit", "Создать": "Create", "Добавить": "Add", "Импорт": "Import", "Поиск": "Search",
        "Продолжить": "Continue", "Копировать": "Copy", "Сменить": "Change", "Найти": "Search", "Войти": "Sign in",
        "Сохранено": "Saved", "Удалено": "Deleted", "Скопировано": "Copied", "Ошибка": "Error",
        "Требуется вход": "Sign-in required", "Без имени": "Unnamed", "Без описания": "No description",
        "Вы": "You", "Персонаж": "Character", "модель": "model", "открыть": "open", "Назад": "Back", "Вниз": "Down",
        "только что": "just now", "ГБ": "GB", "МБ": "MB",
        "Не удалось открыть изображение": "Could not open the image",

        // --- статус модели ---
        "Модель готова": "Model ready", "Ошибка модели": "Model error", "Модель не загружена": "No model loaded",
        "Нажмите, чтобы выбрать": "Click to choose", "Модель загружается…": "Loading the model…",
        "ИИ-модель ещё не выбрана": "No AI model selected yet", "Не удалось загрузить модель": "Could not load the model",
        "Чтобы персонажи могли отвечать, добавьте файл модели в формате .gguf.": "Add a .gguf model file so characters can reply.",
        "Нет модели": "No model",

        // --- главная, персонажи ---
        "Все персонажи": "All characters", "Новый персонаж": "New character", "Новый чат": "New chat",
        "Импорт карточки персонажа (.png / .json)": "Import a character card (.png / .json)",
        "Персонаж импортирован": "Character imported", "Удалить персонажа?": "Delete character?",
        "Пустой чат": "Empty chat", "Удалить чат?": "Delete chat?", "Удалить чат": "Delete chat",
        "История переписки будет удалена.": "The chat history will be deleted.", "Удалённый персонаж": "Deleted character",
        "Пока нет чатов.": "No chats yet.",
        "Сменить изображение": "Change image", "Это изображение также становится фоном чата с персонажем.": "This image is also used as the chat background.",
        "Цвет (если нет картинки)": "Color (if there is no image)", "Теги": "Tags", "Личность": "Identity", "Сцена": "Scene",
        "Поведение бота": "Bot behavior", "Примеры реплик": "Example dialogue",
        "Необязательно. Пример ответа именно этого персонажа — помогает модели поймать его голос. Разметка: *действие*, — реплика, ((мысли)).":
            "Optional. A sample reply from this character helps the model catch its voice. Markup: *action*, — speech, ((thoughts)).",
        "В любом поле можно писать": "In any field you can write", "— имя персонажа и": "for the character's name and", "— имя вашей персоны.": "for your persona's name.",
        "Имя": "Name", "Например: Лира": "e.g. Lyra", "Короткое описание": "Short description", "Видно на карточке персонажа": "Shown on the character card",
        "Странствующая бардесса с тайной в прошлом": "A wandering bard with a secret past",
        "фэнтези, романтика, приключения": "fantasy, romance, adventure",
        "Кто это": "Who they are", "Внешность, возраст, биография, профессия, отношения с собеседником.": "Appearance, age, background, occupation, relationship with you.",
        "Лира — эльфийка-бардесса двадцати шести лет…": "Lyra is a 26-year-old elven bard…",
        "Характер и манера речи": "Personality and speech", "Черты характера, привычки, как говорит, что любит и не любит.": "Traits, habits, how they talk, likes and dislikes.",
        "Остроумная, любопытная, немного дерзкая…": "Witty, curious, a little cheeky…",
        "Сценарий": "Scenario", "Где и при каких обстоятельствах начинается история.": "Where and how the story begins.",
        "Таверна на перекрёстке дорог, поздний вечер…": "A tavern at a crossroads, late evening…",
        "Первое сообщение": "First message", "С этого сообщения персонаж начинает каждый новый чат.": "The character opens every new chat with this message.",
        "*Лира откладывает лютню и садится напротив тебя.* Ну, путник, удиви меня.": "*Lyra puts down her lute and sits across from you.* Well, traveler, surprise me.",
        "Что делает бот и как себя ведёт": "What the bot does and how it behaves",
        "Указания для ИИ: стиль, длина ответов, о чём говорить и о чём нет, особые механики игры.": "Instructions for the AI: style, reply length, topics to cover or avoid, special game mechanics.",
        "Отвечай 2–4 абзацами. Описывай окружение. Веди себя как ведущий игры…": "Reply in 2–4 paragraphs. Describe the surroundings. Act as a game master…",
        "Укажите имя персонажа": "Enter the character's name",
        "Альтернативные приветствия": "Alternative greetings",

        // --- чат ---
        "Персонаж этого чата был удалён.": "The character of this chat has been deleted.",
        "Enter — отправить · Shift+Enter — новая строка · *действия* пишите в звёздочках": "Enter — send · Shift+Enter — new line · write *actions* in asterisks",
        "Написать сообщение…": "Write a message…", "Ваша персона": "Your persona",
        "Настройки чата: память, контекст, стиль, шрифт": "Chat settings: memory, context, style, font",
        "Дождитесь окончания ответа или остановите его": "Wait for the reply to finish or stop it",
        "Модель для ответов": "Model for replies", "Дождитесь окончания ответа": "Wait for the reply to finish",
        "Моделей пока нет": "No models yet", "Управление моделями": "Manage models",
        "Напишите первое сообщение, чтобы начать историю.": "Write the first message to start the story.",
        "пишет ответ": "writing", "проверяет ответ": "checking", "отправляет": "sending", "обдумывает": "thinking",
        "пишет ответ…": "writing…", "думает…": "thinking…",
        "Остановить": "Stop", "Отправить": "Send", "Модель ещё загружается…": "The model is still loading…",
        "Сначала загрузите ИИ-модель": "Load an AI model first", "Нет связи с компьютером": "No connection to the PC",
        "Другой вариант ответа": "Another reply", "Продолжить ответ": "Continue the reply", "Копировать": "Copy",
        "Удалить сообщение?": "Delete message?", "Удалить только это сообщение": "Delete only this message",
        "Удалить это и все следующие": "Delete this and all following", "Кем вы играете?": "Who are you playing as?",
        "Управление персонами": "Manage personas", "Сменить модель": "Change model", "Найти значение слова": "Look up a word",
        "Настройки чата": "Chat settings", "Профиль персонажа": "Character profile", "Изменить персонажа": "Edit character",
        "Удалить этот чат": "Delete this chat",
        "Найти значение слова (выделите слово в переписке)": "Look up a word (select a word in the chat)",
        "Модель вернула пустой ответ. Попробуйте ещё раз или выберите другую модель.": "The model returned an empty reply. Try again or pick another model.",
        "Ответ остановлен": "Reply stopped",
        "Модель не успела ответить за отведённое время. Увеличьте «Время на ответ» в настройках или выберите модель полегче.": "The model did not finish in time. Increase “Reply time limit” in Settings or pick a lighter model.",

        // --- внешний вид ---
        "Размер шрифта сообщений": "Message font size", "— Пример текста, — сказала она, улыбнувшись.": "— Sample text, — she said with a smile.",
        "Шрифт": "Font", "Книжный шрифт с засечками удобнее для длинных ответов.": "A serif book font is easier for long replies.",
        "Обычный": "Regular", "Книжный": "Book", "Фон чата": "Chat background", "Фото персонажа из его карточки.": "The character's picture from their card.",
        "Фото персонажа": "Character picture", "Размытое фото": "Blurred picture", "Без фона": "No background",
        "Ответы бота блоками": "Bot replies as blocks", "Действия, реплики и мысли — отдельными блоками.": "Actions, speech and thoughts as separate blocks.",
        "Иконки у блоков": "Block icons", "✋ действие · ❝ реплика · ☁ мысли": "✋ action · ❝ speech · ☁ thoughts",
        "Затемнение фона": "Background dimming", "Эти настройки сохраняются отдельно на каждом устройстве (ПК и телефон).": "These settings are saved separately on each device (PC and phone).",

        // --- настройки чата ---
        "вся переписка": "whole chat",
        "Действуют только для этого чата. Остальное — в разделе «Настройки».": "Apply to this chat only. Everything else is in Settings.",
        "Контекст чата": "Chat context",
        "Важные факты, которые бот должен помнить всегда, даже если старые сообщения уже не помещаются в его память: кто есть кто, что произошло, где вы сейчас.":
            "Key facts the bot must always remember, even when old messages no longer fit in its memory: who is who, what happened, where you are now.",
        "Составить из переписки": "Summarize the chat", "Память бота": "Bot memory",
        "Сколько последних сообщений бот перечитывает перед ответом.": "How many recent messages the bot rereads before replying.",
        "Стиль ответов": "Reply style", "Длина ответов": "Reply length", "Внешний вид": "Appearance",
        "Составляю…": "Summarizing…", "Сводка готова — проверьте и сохраните": "Summary ready — review and save",
        "Настройки чата сохранены": "Chat settings saved",

        // --- словарь ---
        "Новый термин": "New term", "Термин словаря": "Lorebook term", "Слова-ключи": "Keywords",
        "Через запятую. Когда любое из них встретится в последних сообщениях, бот получит объяснение. Можно писать начало слова: «академи» найдёт «академия», «академии».":
            "Comma-separated. When any of them appears in recent messages, the bot gets the explanation. Word stems work: “acade” matches “academy”, “academic”.",
        "Значение": "Meaning", "Коротко и по делу: что значит и как употребляется.": "Short and to the point: what it means and how it is used.",
        "Сленг: чувство неловкости, «испанский стыд» за чьи-то действия.": "Slang: secondhand embarrassment at someone's actions.",
        "Для кого": "For whom", "Всегда помнить": "Always remember",
        "Подставлять всегда, даже если слово не упоминалось (для важных фактов о мире).": "Always include it, even if the word was not mentioned (for key world facts).",
        "Включено": "Enabled", "Удалить термин?": "Delete term?", "Укажите хотя бы одно слово-ключ": "Enter at least one keyword",
        "Напишите значение": "Write the meaning", "Добавлено в словарь — бот будет это учитывать": "Added to the lorebook — the bot will take it into account",
        "Найти значение": "Look up a meaning",
        "Ищет в Викисловаре, Википедии и DuckDuckGo. В интернет отправляется только это слово — не ваш чат.": "Searches Wiktionary, Wikipedia and DuckDuckGo. Only this word is sent online — never your chat.",
        "Слово или выражение": "Word or phrase", "Добавить вручную": "Add manually",
        "Ничего не нашлось. Попробуйте начальную форму слова или добавьте значение вручную.": "Nothing found. Try the base form of the word or add the meaning manually.",
        "Кратко (моделью)": "Summarize (model)", "В словарь": "To lorebook",
        "Локальная модель перескажет справку в 1–2 предложениях": "The local model will condense this into 1–2 sentences",
        "Сленг, термины, факты о мире. Когда слово встречается в переписке, бот незаметно получает его значение и использует правильно. Работает без интернета.":
            "Slang, terms, world facts. When a word appears in the chat, the bot silently gets its meaning and uses it correctly. Works offline.",
        "Найти в интернете": "Search online", "Поиск по словарю": "Search the lorebook", "Ничего не найдено.": "Nothing found.",
        "Словарь пока пуст. Добавьте термин вручную или найдите его значение в интернете.": "The lorebook is empty. Add a term manually or look up its meaning online.",
        "Подсказка: в чате выделите непонятное слово — появится кнопка «Найти».": "Tip: select an unfamiliar word in the chat and press 🔍.",
        "всегда": "always", "выкл": "off", "Источник:": "Source:",
        "Пустой запрос": "Empty query", "Нет связи с интернетом на компьютере": "The PC has no internet connection",
        "Запись не найдена": "Entry not found",

        // --- персоны ---
        "Новая персона": "New persona", "Персона": "Persona",
        "Персона — это тот, кем играете вы: имя, внешность, характер. Персонажи будут обращаться к вам так и учитывать описание.":
            "A persona is who you play: name, appearance, personality. Characters will address you this way and take the description into account.",
        "Нажмите на круг, чтобы выбрать аватар.": "Click the circle to choose an avatar.", "Как к вам обращаться": "What to call you",
        "Описание": "Description", "Внешность, возраст, характер, кем вы приходитесь персонажам.": "Appearance, age, personality, your relationship to the characters.",
        "Высокий темноволосый наёмник с шрамом через бровь…": "A tall dark-haired mercenary with a scar across his brow…",
        "по умолчанию": "default", "Сделать по умолчанию": "Make default", "Удалить персону?": "Delete persona?",
        "Введите имя": "Enter a name", "Нужна хотя бы одна персона": "At least one persona is required",

        // --- модель ---
        "ИИ-модель": "AI model", "Нейросеть работает прямо на вашем компьютере — без интернета и без внешней модерации.": "The neural network runs right on your computer — no internet and no external moderation.",
        "Ваши модели": "Your models", "Где взять модель": "Where to get a model", "Откройте": "Open",
        "Hugging Face → модели GGUF": "Hugging Face → GGUF models", "Ищите по словам": "Search for", "или": "or",
        "— это версии, дообученные для ролевых игр или со снятыми встроенными отказами.": "— versions fine-tuned for role-play or with built-in refusals removed.",
        "Откройте вкладку": "Open the", "и скачайте один файл": "tab and download one", "с пометкой": "file marked",
        "— лучший баланс качества и размера.": "— the best balance of quality and size.", "— качественнее, но тяжелее.": "— better quality, but heavier.",
        "Добавьте файл сюда кнопкой выше или положите в «Папку моделей».": "Add the file with the button above or put it in the models folder.",
        "Видеопамять (VRAM)": "Video memory (VRAM)", "Размер модели": "Model size", "Файл Q4_K_M": "Q4_K_M file",
        "Если модель больше видеопамяти, часть её уйдёт в оперативную память — будет работать, но медленнее. Для русского языка лучше подходят модели на базе Qwen, Gemma, Mistral Nemo/Small.":
            "If the model is larger than VRAM, part of it goes to system RAM — it works, but slower. For Russian, models based on Qwen, Gemma and Mistral Nemo/Small work best.",
        "Видеокарта (Vulkan)": "GPU (Vulkan)", "Видеокарта NVIDIA (CUDA)": "NVIDIA GPU (CUDA)", "Процессор": "CPU", "Тестовый режим": "Test mode",
        "Выберите модель из списка ниже": "Choose a model from the list below", "Выгрузить": "Unload", "Загрузить": "Load",
        "активна": "active", "загрузка": "loading", "файл не найден": "file not found", "Убрать из списка": "Remove from list",
        "Пока нет ни одной модели.": "No models yet.", "Этот файл лежит в папке моделей — удалите его оттуда": "This file is in the models folder — delete it there",
        "Нужен файл с расширением .gguf": "A .gguf file is required", "Модель добавлена": "Model added",
        "Перетащите сюда файл": "Drop a", "Выбрать файл модели": "Choose model file", "Папка моделей": "Models folder",
        "Добавлять новые файлы моделей можно на компьютере. Здесь можно переключиться между уже добавленными.": "New model files can be added on the PC. Here you can switch between models already added.",
        "Нужен файл .gguf": "A .gguf file is required", "Файл не найден": "File not found", "Не указан путь": "No path given",
        "Модель занята другим ответом": "The model is busy with another reply", "Не удалось создать контекст модели": "Could not create the model context",

        // --- настройки ---
        "Ответы бота": "Bot replies", "Минимальная длина ответа": "Minimum reply length",
        "Общее правило для всех чатов и ботов: ответ не короче этого значения (не меньше 450 символов). Если модель ответила короче, Lumina попросит её дописать.":
            "A rule for all chats and bots: replies are at least this long (450 characters minimum). If the model replies shorter, Lumina asks it to continue.",
        "Мысли персонажа": "Character thoughts",
        "Бот показывает, о чём думает персонаж, отдельным блоком ((мысли)) — как будто ваш герой умеет их читать.": "The bot shows what the character is thinking in a separate ((thoughts)) block — as if your hero could read minds.",
        "Время на ответ": "Reply time limit",
        "Сколько персонаж может готовить ответ. Ответ приходит целиком, а не печатается по буквам. Больше времени — длиннее и аккуратнее ответ; если модель не успевает, ответ обрезается по последнему законченному предложению.":
            "How long the character may prepare a reply. The reply arrives complete instead of being typed out. More time means a longer, more careful reply; if the model runs out of time, the reply is cut at the last complete sentence.",
        "Проверять ответ перед отправкой": "Check the reply before sending",
        "Модель перечитывает черновик и исправляет орфографию, опечатки и логические нестыковки. На проверку отводится до 40% «Времени на ответ»; если не успевает — отправляется черновик.":
            "The model rereads the draft and fixes spelling, typos and logical inconsistencies. Up to 40% of the reply time limit goes to the check; if it runs out, the draft is sent.",
        "Уведомления об ответах": "Reply notifications", "Звук и вибрация": "Sound and vibration", "(это устройство)": "(this device)",
        "Короткий сигнал, когда ответ пришёл, пока Lumina открыта.": "A short chime when a reply arrives while Lumina is open.",
        "Уведомления Windows": "Windows notifications", "Когда окно Lumina свёрнуто или в трее.": "When the Lumina window is minimized or in the tray.",
        "Push-уведомления на телефон": "Push notifications to the phone",
        "Приходят, даже когда телефон заблокирован и Lumina закрыта. Работают через бесплатное приложение": "Arrive even when the phone is locked and Lumina is closed. They work through the free app",
        "; компьютеру нужен интернет.": "; the PC needs internet access.",
        "Сленг, термины и факты о мире": "Slang, terms and world facts",
        "Бот получает значение слова, когда оно встречается в переписке. Можно найти значение в интернете и сохранить.": "The bot gets a word's meaning when it appears in the chat. You can look meanings up online and save them.",
        "Формат сообщений": "Message format", "«Универсальный» разделяет ответ на действия, реплики и мысли.": "“Universal” splits a reply into actions, speech and thoughts.",
        "Создать свой стиль на основе этого": "Create your own style based on this", "Новый стиль с нуля": "New style from scratch",
        "Разметка, которую понимает Lumina:": "Markup Lumina understands:", "*действие*": "*action*", "— реплика": "— speech", "((мысли))": "((thoughts))",
        ". В своём стиле напишите правила и пример ответа — бот повторит манеру примера, но не его содержание.": ". In your own style, write rules and a sample reply — the bot copies the manner of the sample, not its content.",
        "Так будет выглядеть ответ:": "A reply will look like this:",
        "Генерация": "Generation", "Характер ответов": "Reply character", "Свой": "Custom", "Свои значения": "Custom values",
        "Свои значения (см. «Для опытных»)": "Custom values (see “Advanced”)",
        "Проверка орфографии словарём": "Dictionary spell-check",
        "Перед отправкой ответ проверяется русским словарём (без интернета, доли секунды): явные опечатки исправляются сразу, сомнительные слова — при проверке моделью.":
            "Before sending, the reply is checked against a Russian dictionary (offline, milliseconds): obvious typos are fixed at once, doubtful words during the model check.",
        "Для опытных": "Advanced",
        "Креативность (temperature)": "Creativity (temperature)",
        "Выше — неожиданнее, но больше ошибок и бессвязности. Для моделей 7–14B разумно 0.6–1.0.": "Higher is more surprising but brings more errors and incoherence. 0.6–1.0 is sensible for 7–14B models.",
        "Отсекает маловероятные слова. 0.05–0.1 — хорошо для ролевых игр.": "Cuts off unlikely words. 0.05–0.1 works well for role-play.",
        "Штраф за повторы (классический)": "Repetition penalty (classic)",
        "Штрафует отдельные слова и окончания — в русском при значениях выше 1.1 появляются искажённые слова. Лучше держать 1.0–1.05 и использовать DRY.":
            "Penalizes individual words and endings — in Russian, values above 1.1 produce mangled words. Keep it at 1.0–1.05 and use DRY.",
        "Антиповтор фраз (DRY)": "Phrase anti-repetition (DRY)",
        "Не даёт повторять целые фразы и обороты, не трогая отдельные слова. 0.8 — рекомендуется, 0 — выключено.": "Prevents repeating whole phrases without touching individual words. 0.8 recommended, 0 off.",
        "Память бота": "Bot memory", "Объём памяти (контекст модели)": "Memory size (model context)",
        "Сколько текста модель держит в голове одновременно. Больше — бот помнит дольше, но нужно больше видеопамяти/ОЗУ. 8192 ≈ 20–25 тыс. символов. После изменения перезагрузите модель.":
            "How much text the model keeps in mind at once. More means a longer memory but needs more VRAM/RAM. 8192 ≈ 20–25k characters. Reload the model after changing it.",
        "Ограничитель памяти": "Memory limit",
        "Сколько последних сообщений бот перечитывает. 0 — вся переписка, сколько поместится в память. Для отдельных чатов можно задать своё значение и «Контекст чата» (кнопка ⚙ в чате).":
            "How many recent messages the bot rereads. 0 means the whole chat, as much as fits. Individual chats can have their own value and a “Chat context” (the ⚙ button in a chat).",
        "Вычисления": "Compute", "«Авто» использует видеокарту, если она есть.": "“Auto” uses the GPU if there is one.",
        "Авто": "Auto", "Видеокарта": "GPU",
        "Загружать модель при запуске": "Load the model on startup", "Последняя использованная модель будет готова сразу.": "The last used model will be ready right away.",
        "Системный промпт": "System prompt", "Общие указания для всех персонажей.": "General instructions for all characters.",
        "— сюда подставляется профиль персонажа,": "— the character profile goes here,", "— ваша персона.": "— your persona.",
        "Вернуть стандартный": "Restore default", "Программа": "Application",
        "Сворачивать в трей при закрытии окна": "Minimize to tray when the window is closed",
        "Lumina продолжит работать в фоне (значок у часов), телефон останется подключённым.": "Lumina keeps running in the background (icon near the clock), and the phone stays connected.",
        "Закрыть программу": "Quit the application",
        "Полностью выключить Lumina и выгрузить модель. То же самое: правый клик по значку в трее → «Закрыть Lumina».": "Shut Lumina down completely and unload the model. Same as right-clicking the tray icon → “Quit Lumina”.",
        "В трей": "To tray", "Lumina 1.6 · всё хранится только на вашем компьютере": "Lumina 1.6 · everything stays on your computer",
        "Чтобы применить, перезагрузите модель на вкладке «Модель»": "Reload the model on the Model tab to apply",
        "Стиль применён ко всем чатам": "Style applied to all chats",
        "Изменить стиль": "Edit style", "Свой стиль ответов": "Custom reply style", "Название": "Name", "Например: Манга-нуар": "e.g. Manga noir",
        "Правила оформления": "Formatting rules", "Как писать: от какого лица, что выделять, какие блоки использовать.": "How to write: which person, what to highlight, which blocks to use.",
        "Пример ответа": "Sample reply", "Бот будет повторять манеру и формат этого примера.": "The bot will copy the manner and format of this sample.",
        "Предпросмотр:": "Preview:", "Сохранить и выбрать": "Save and select", "Напишите пример — здесь появится предпросмотр.": "Write a sample — the preview appears here.",
        "Введите название стиля": "Enter a style name", "Стиль сохранён и выбран": "Style saved and selected", "Удалить стиль?": "Delete style?", "Стиль удалён": "Style deleted",
        "Закрыть Lumina?": "Quit Lumina?", "Программа полностью выключится, телефон отключится от компьютера.": "The app will shut down completely and the phone will disconnect.",
        "Язык интерфейса": "Interface language", "Язык меню и кнопок. Ответы персонажей идут на том языке, на котором пишете вы.": "Language of menus and buttons. Characters reply in the language you write in.",
        "Поддержать автора": "Support the author", "Lumina бесплатна. Если она вам нравится, можно поддержать разработку донатом.": "Lumina is free. If you enjoy it, you can support development with a donation.",
        "Задонатить": "Donate", "❤ Поддержать автора": "❤ Support the author",

        // --- уведомления ---
        "Установите на iPhone приложение": "Install the", "из App Store и разрешите ему уведомления.": "app from the App Store on your iPhone and allow notifications.",
        "В ntfy нажмите": "In ntfy, tap", "и введите название канала (сервер оставьте ntfy.sh):": "and enter the topic name (keep the ntfy.sh server):",
        "Показывать начало ответа": "Show the start of the reply",
        "Иначе придёт только «Персонаж ответил(а)». Текст уходит через сервер ntfy.sh — название канала держите в секрете.": "Otherwise you only get “Character replied”. The text goes through the ntfy.sh server — keep the topic name secret.",
        "Отправить тестовое уведомление": "Send a test notification", "Название канала скопировано": "Topic name copied",
        "Новое название — старые подписки перестанут получать уведомления": "New name — old subscriptions will stop receiving notifications",
        "Сменить канал?": "Change topic?", "Телефон придётся подписать на новое название в приложении ntfy.": "You will need to subscribe the phone to the new name in the ntfy app.",
        "Отправлено — проверьте телефон": "Sent — check your phone",

        // --- телефон / Wi-Fi ---
        "📱 Играть с телефона": "📱 Play from your phone", "Доступ по Wi‑Fi": "Wi‑Fi access",
        "Открывайте Lumina на iPhone, iPad или другом устройстве в той же сети.": "Open Lumina on an iPhone, iPad or other device on the same network.",
        "Наведите камеру iPhone на QR-код или откройте в Safari:": "Point the iPhone camera at the QR code or open in Safari:",
        "PIN-код для входа": "Sign-in PIN", "Новый PIN — все устройства придётся подключить заново": "New PIN — all devices will need to reconnect",
        "Телефон и компьютер должны быть в одной Wi‑Fi сети.": "The phone and PC must be on the same Wi‑Fi network.",
        "Если Windows спросит про брандмауэр — разрешите доступ в": "If Windows asks about the firewall, allow access on", "частных сетях": "private networks",
        "В Safari нажмите «Поделиться» → «На экран Домой» — получится иконка как у приложения.": "In Safari tap Share → Add to Home Screen to get an app icon.",
        "Компьютер должен быть включён, а Lumina — запущена (можно свернуть в трей).": "The PC must be on and Lumina running (it can be minimized to the tray).",
        "Не найдено подключение к локальной сети. Проверьте Wi‑Fi или кабель.": "No local network connection found. Check Wi‑Fi or the cable.",
        "Сменить PIN?": "Change PIN?", "Все подключённые устройства придётся подключить заново.": "All connected devices will need to reconnect.",
        "Вы подключены к компьютеру по Wi‑Fi": "You are connected to the PC over Wi‑Fi",
        "Персонажи и чаты хранятся на компьютере и синхронизируются автоматически. Совет: в Safari «Поделиться» → «На экран Домой».": "Characters and chats are stored on the PC and sync automatically. Tip: in Safari, Share → Add to Home Screen.",
        "Выйти": "Sign out", "Синхронизация": "Sync", "Обновить данные прямо сейчас.": "Refresh data now.",
        "Введите PIN-код, который показан на компьютере в разделе «Настройки» → «Играть с телефона».": "Enter the PIN shown on the PC in Settings → Play from your phone.",
        "Доступ по Wi‑Fi сейчас выключен на компьютере.": "Wi‑Fi access is currently turned off on the PC.", "Ошибка входа": "Sign-in error",
        "Нет связи с компьютером.": "No connection to the PC.", "Проверьте, что Lumina запущена и вы в той же Wi‑Fi сети.": "Make sure Lumina is running and you are on the same Wi‑Fi network.",
        "Неверный PIN": "Wrong PIN", "Слишком много попыток. Подождите 10 минут.": "Too many attempts. Wait 10 minutes.",
        "Доступ с других устройств выключен на компьютере": "Access from other devices is turned off on the PC", "Только с компьютера": "PC only",

        // --- серверные сообщения ---
        "Персонаж удалён": "The character was deleted", "Сначала загрузите ИИ-модель (раздел «Модель»)": "Load an AI model first (Model section)",
        "Модель ещё отвечает в другом чате": "The model is still replying in another chat", "Нечего перегенерировать": "Nothing to regenerate",
        "Нечего продолжать": "Nothing to continue", "Модель сейчас занята ответом": "The model is busy replying",
        "В чате пока нечего пересказывать": "Nothing to summarize in this chat yet", "Слишком большой запрос": "Request too large",
        "Некорректный JSON": "Invalid JSON", "Не найден": "Not found", "Не найдена": "Not found", "Персонаж не найден": "Character not found",
        "Чат не найден": "Chat not found", "Сообщение не найдено": "Message not found", "Нет такого метода": "No such method",

        // --- наборы, стили, длины (приходят с сервера) ---
        "Стабильный": "Stable", "Сбалансированный": "Balanced", "Творческий": "Creative",
        "Меньше ошибок и неожиданностей, ровный стиль": "Fewer errors and surprises, an even style",
        "Живо, но грамотно — рекомендуется": "Lively but accurate — recommended", "Неожиданнее и ярче, чуть больше ошибок": "More surprising and vivid, slightly more errors",
        "Короткие": "Short", "Средние": "Medium", "Длинные": "Long", "Очень длинные": "Very long",
        "1–2 абзаца, примерно 450–700 символов": "1–2 paragraphs, about 450–700 characters", "2–4 абзаца, примерно 700–1200 символов": "2–4 paragraphs, about 700–1200 characters",
        "4–6 абзацев, примерно 1200–2000 символов": "4–6 paragraphs, about 1200–2000 characters", "6–9 абзацев, примерно 2000–3000 символов": "6–9 paragraphs, about 2000–3000 characters",
        "Универсальный (блоки)": "Universal (blocks)", "Книга: от третьего лица": "Book: third person", "Книга: от первого лица": "Book: first person",
        "Ролевой: *действия* и речь": "Role-play: *actions* and speech", "Мой стиль": "My style",
        "Действие": "Action", "Реплика": "Speech", "Мысли": "Thoughts"
    };

    const PATTERNS = [
        [/^(\d+) мин$/, "$1 min"], [/^(\d+) ч$/, "$1 h"], [/^(\d+) дн$/, "$1 d"],
        [/^([\d.,]+) ГБ$/, "$1 GB"], [/^([\d.,]+) МБ$/, "$1 MB"],
        [/^([\d.,]+) (ГБ|МБ) · активна$/, (m, n, u) => `${n} ${u === "ГБ" ? "GB" : "MB"} · active`],
        [/^([\d.,]+) (ГБ|МБ) · загружается$/, (m, n, u) => `${n} ${u === "ГБ" ? "GB" : "MB"} · loading`],
        [/^([\d.,]+) (ГБ|МБ) · ([\s\S]*)$/, (m, n, u, rest) => `${n} ${u === "ГБ" ? "GB" : "MB"} · ${rest}`],
        [/^файл не найден · (.*)$/, "file not found · $1"],
        [/^Загрузка (\d+)%$/, "Loading $1%"], [/^(\d+)% · /, "$1% · "],
        [/^Импортировано персонажей: (\d+)$/, "Characters imported: $1"],
        [/^последние (\d+) сообщ\.$/, "last $1 messages"], [/^(\d+) сообщ\.$/, "$1 messages"],
        [/^(\d+) токенов$/, "$1 tokens"], [/^(\d+) симв\.$/, "$1 chars"], [/^(\d+) с$/, "$1 s"],
        [/^(\d+) мин (\d+) с$/, "$1 min $2 s"], [/^(\d+) \/ (\d+) с$/, "$1 / $2 s"],
        [/^Как в настройках \((.*)\)$/, (m, x) => `As in settings (${tr(x) || x})`],
        [/^Только: (.+)$/, "Only: $1"], [/^Чаты с (.+)$/, "Chats with $1"],
        [/^Например: Лира и Путник вместе ищут пропавшего брата Лиры[\s\S]*$/, () => "e.g. Lyra and the Traveler are searching for Lyra’s missing brother. Yesterday they escaped from the baron’s castle…"],
        [/^Вы: /, "You: "],
        [/^«(.+)» и все чаты с ним будут удалены без возможности восстановления\.$/, "“$1” and all its chats will be deleted permanently."],
        [/^«(.+)» будет удалён из словаря\.$/, "“$1” will be removed from the lorebook."],
        [/^«(.+)» будет удалена\.$/, "“$1” will be deleted."], [/^«(.+)» будет удалён\.$/, "“$1” will be deleted."],
        [/^ищу «(.+)»…$/, "searching “$1”…"], [/^Найти «(.+)»$/, "Look up “$1”"],
        [/^Набор «(.+)» применён$/, (m, x) => `Preset “${tr(x) || x}” applied`],
        [/^(.+) \(мой\)$/, "$1 (mine)"],
        [/^Загружаю модель (.+)…$/, "Loading model $1…"],
        [/^ИИ-модель: (.+) — нажмите, чтобы сменить$/, (m, x) => `AI model: ${x === "не загружена" ? "not loaded" : x} — click to change`],
        [/^Температура ([\d.]+) — высоко: модель будет чаще ошибаться в словах и терять нить разговора\.$/, "Temperature $1 is high: the model will make more word errors and lose the thread."],
        [/^Штраф за повторы ([\d.]+) — высоко: в русском это ломает окончания и слова\.$/, "Repetition penalty $1 is high: in Russian it breaks word endings."],
        [/^Файл модели не найден: (.+)$/, "Model file not found: $1"],
        [/^Не удалось отправить: (.+)\. Нужен интернет на компьютере\.$/, "Could not send: $1. The PC needs internet access."],
        [/^Lumina (\d+\.\d+) · всё хранится только на вашем компьютере$/, "Lumina $1 · everything stays on your computer"]
    ];

    function tr(s) {
        const key = s.replace(/\s+/g, " ").trim();
        if (!key || !/[А-Яа-яЁё]/.test(key)) return null;
        if (EN[key]) return EN[key];
        for (const [re, rep] of PATTERNS) if (re.test(key)) return key.replace(re, rep);
        return null;
    }

    // где текст пишет пользователь или модель — не переводим
    const SKIP = ".bubble, .style-preview, textarea, input, [contenteditable], .no-i18n, .desc-block, .lore-li .t span, .ccard .tl";
    const ATTRS = ["placeholder", "title", "aria-label"];

    function translateText(node) {
        const p = node.parentElement;
        if (!p || p.closest(SKIP) || p.closest("script,style")) return;
        const v = node.nodeValue;
        const t = tr(v);
        if (t != null) {
            const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
            node.nodeValue = lead + t + trail;
        }
    }
    function translateAttrs(el) {
        if (el.closest && el.closest(".bubble")) return;
        for (const a of ATTRS) {
            const v = el.getAttribute && el.getAttribute(a);
            if (v) { const t = tr(v); if (t != null) el.setAttribute(a, t); }
        }
    }
    function translateTree(root) {
        if (lang !== "en" || !root) return;
        if (root.nodeType === 3) return translateText(root);
        if (root.nodeType !== 1) return;
        translateAttrs(root);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n;
        while ((n = w.nextNode())) {
            if (n.nodeType === 3) translateText(n);
            else translateAttrs(n);
        }
    }

    let observer = null;
    function start() {
        if (lang !== "en" || observer) return;
        document.documentElement.lang = "en";
        translateTree(document.body);
        observer = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type === "childList") m.addedNodes.forEach(translateTree);
                else if (m.type === "characterData") translateText(m.target);
                else if (m.type === "attributes") translateAttrs(m.target);
            }
        });
        observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
    }

    window.I18N = {
        get lang() { return lang; },
        /** перевод строки для мест, где текст не попадает в документ (заголовок окна и т. п.) */
        t(s) { return lang === "en" ? (tr(s) ?? s) : s; },
        setLang(l) {
            lang = l === "en" ? "en" : "ru";
            try { localStorage.setItem(LANG_KEY, lang); } catch {}
        },
        start
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
