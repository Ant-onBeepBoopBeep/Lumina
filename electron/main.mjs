// Главный процесс Electron: запускает сервер с моделью и открывает окно интерфейса.
import {app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification} from "electron";
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {startServer} from "../server/server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(__dirname, "..", "build", "icon.png");

let win = null;
let tray = null;
let srv = null;
let quitting = false;
let balloonShown = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => showWindow());
    app.whenReady().then(boot);
}

async function boot() {
    Menu.setApplicationMenu(null);
    if (process.platform === "win32") app.setAppUserModelId("app.lumina.local"); // нужно для уведомлений Windows
    const dataDir = path.join(app.getPath("userData"), "data");
    srv = await startServer({dataDir, staticDir: path.join(__dirname, "..", "web"), onReply: desktopNotify});

    ipcMain.handle("pick-model", async () => {
        const r = await dialog.showOpenDialog(win, {
            title: "Выберите файл ИИ-модели",
            filters: [{name: "Модель GGUF", extensions: ["gguf"]}],
            properties: ["openFile"]
        });
        if (r.canceled || !r.filePaths[0]) return null;
        return r.filePaths[0];
    });
    ipcMain.handle("open-path", (_e, p) => shell.openPath(p));
    ipcMain.handle("open-url", (_e, u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); });
    ipcMain.handle("quit-app", () => quitApp());
    ipcMain.handle("hide-to-tray", () => { win?.hide(); });

    createWindow();
    createTray();
}

function createWindow() {
    win = new BrowserWindow({
        width: 1320, height: 860, minWidth: 380, minHeight: 560,
        backgroundColor: "#0b0b12",
        title: "Lumina",
        icon: ICON,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true
        }
    });
    win.loadURL(`http://127.0.0.1:${srv.port}/`);
    win.once("ready-to-show", () => win.show());
    win.webContents.setWindowOpenHandler(({url}) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return {action: "deny"};
    });
    win.on("close", (e) => {
        if (quitting || !tray) return;
        if (srv.store.settings.closeToTray) {
            e.preventDefault();
            win.hide();
            if (!balloonShown) {
                balloonShown = true;
                tray.displayBalloon?.({
                    title: "Lumina работает в фоне",
                    content: "Телефон остаётся подключённым. Чтобы закрыть программу: правый клик по значку в трее → «Закрыть Lumina»."
                });
            }
        }
    });
    win.on("closed", () => { win = null; });
}

// Уведомление Windows о готовом ответе, если окно свёрнуто или не в фокусе
function desktopNotify({chatId, title, preview}) {
    if (!srv?.store.settings.desktopNotify || !Notification.isSupported()) return;
    if (win && win.isVisible() && win.isFocused()) return;
    const n = new Notification({title, body: preview || "Новое сообщение", icon: ICON, silent: false});
    n.on("click", () => {
        showWindow();
        win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify("#/chat/" + chatId)}`).catch(() => {});
    });
    n.show();
}

function showWindow() {
    if (!win) createWindow();
    else { win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
}

// Полный выход: окно, сервер и модель. Если модель долго выгружается — выходим принудительно.
let quitStarted = false;
async function quitApp() {
    if (quitStarted) return;
    quitStarted = true;
    quitting = true;
    try { tray?.destroy(); } catch {}
    tray = null;
    try { win?.destroy(); } catch {}
    const hard = setTimeout(() => app.exit(0), 3000);
    try { if (srv) await srv.close(); } catch {}
    clearTimeout(hard);
    app.exit(0);
}

function trayMenu() {
    const s = srv?.store.settings || {};
    return Menu.buildFromTemplate([
        {label: "Открыть Lumina", click: showWindow},
        {type: "separator"},
        {
            label: "Сворачивать в трей при закрытии окна", type: "checkbox", checked: !!s.closeToTray,
            click: (item) => { srv.store.settings.closeToTray = item.checked; srv.store.saveSettings(); }
        },
        {type: "separator"},
        {label: "Закрыть Lumina", click: quitApp}
    ]);
}

function createTray() {
    try {
        const ico = path.join(__dirname, "..", "build", "icon.ico");
        let img = fs.existsSync(ico) ? nativeImage.createFromPath(ico) : nativeImage.createFromPath(ICON);
        if (img.isEmpty()) img = nativeImage.createFromPath(ICON);
        tray = new Tray(img.resize({width: 16, height: 16}));
        tray.setToolTip("Lumina — правый клик: меню и выход");
        // меню собираем заново при каждом открытии, чтобы галочка была актуальной
        tray.on("right-click", () => tray.popUpContextMenu(trayMenu()));
        tray.on("click", showWindow);
        tray.on("double-click", showWindow);
    } catch (e) {
        console.error("tray", e);
    }
}

app.on("before-quit", (e) => {
    if (!quitStarted) { e.preventDefault(); quitApp(); }
});
app.on("window-all-closed", () => {
    // окно закрыто без сворачивания в трей — выходим полностью
    if (!srv?.store.settings.closeToTray || !tray) quitApp();
});
