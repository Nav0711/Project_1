import { BrowserWindow as e, app as t } from "electron";
import n from "node:path";
import { fileURLToPath as r } from "node:url";
//#region electron/main.ts
var i = r(import.meta.url), a = n.dirname(i);
process.env.DIST = n.join(a, "../dist"), process.env.VITE_PUBLIC = t.isPackaged ? process.env.DIST : n.join(process.env.DIST, "../public");
var o, s = process.env.VITE_DEV_SERVER_URL;
function c() {
	o = new e({
		icon: n.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		webPreferences: { preload: n.join(a, "preload.js") },
		width: 1200,
		height: 800
	}), o.webContents.on("did-finish-load", () => {
		o?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), s ? o.loadURL(s) : o.loadFile(n.join(process.env.DIST, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), o = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && c();
}), t.whenReady().then(c);
//#endregion
export {};
