//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let node_events = require("node:events");
node_events = __toESM(node_events);
//#region ../sdk/dist/preview-mock.js
/**
* Preview Mock 模块
* 为 preview 模式提供 Electron API 的 mock 实现
*/
var STORAGE_PREFIX = "translime-preview-settings:";
/**
* Mock IPC 实现
* @returns {Object}
*/
function createMockIpc() {
	return {
		invoke: async (channel, ...args) => {
			console.log("[Preview Mock] ipc.invoke:", channel, args);
			return null;
		},
		send: (channel, ...args) => {
			console.log("[Preview Mock] ipc.send:", channel, args);
		},
		on: (channel, callback) => {
			console.log("[Preview Mock] ipc.on registered:", channel, Boolean(callback));
			return () => {
				console.log("[Preview Mock] ipc.on removed:", channel);
			};
		},
		once: (channel, callback) => {
			console.log("[Preview Mock] ipc.once registered:", channel, Boolean(callback));
		},
		removeListener: (channel, callback) => {
			console.log("[Preview Mock] ipc.removeListener:", channel, Boolean(callback));
		},
		removeAllListeners: (channel) => {
			console.log("[Preview Mock] ipc.removeAllListeners:", channel);
		}
	};
}
/**
* Mock Dialog 实现
* @returns {Object}
*/
function createMockDialog() {
	return {
		showOpenDialog: async (options) => {
			console.log("[Preview Mock] showOpenDialog:", options);
			return new Promise((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				if (options?.properties?.includes("openDirectory")) input.webkitdirectory = true;
				if (options?.properties?.includes("multiSelections")) input.multiple = true;
				if (options?.filters) input.accept = options.filters.flatMap((f) => f.extensions.map((ext) => `.${ext}`)).join(",");
				input.onchange = () => {
					const filePaths = Array.from(input.files || []).map((f) => f.name);
					resolve({
						canceled: filePaths.length === 0,
						filePaths
					});
				};
				input.oncancel = () => {
					resolve({
						canceled: true,
						filePaths: []
					});
				};
				input.click();
			});
		},
		showSaveDialog: async (options) => {
			console.log("[Preview Mock] showSaveDialog:", options);
			const fileName = prompt("保存文件名：", options?.defaultPath || "file.txt");
			return {
				canceled: !fileName,
				filePath: fileName || void 0
			};
		},
		showMessageBox: async (options) => {
			console.log("[Preview Mock] showMessageBox:", options);
			return { response: window.confirm(options?.message || "") ? 0 : 1 };
		},
		showErrorBox: (title, content) => {
			console.error("[Preview Mock] showErrorBox:", title, content);
			alert(`${title}\n\n${content}`);
		}
	};
}
/**
* Mock Shell 实现
* @returns {Object}
*/
function createMockShell() {
	return {
		openExternal: async (url) => {
			console.log("[Preview Mock] shell.openExternal:", url);
			window.open(url, "_blank");
		},
		openPath: async (path) => {
			console.log("[Preview Mock] shell.openPath:", path);
			alert(`[Preview] 无法在浏览器中打开路径: ${path}`);
		},
		showItemInFolder: (path) => {
			console.log("[Preview Mock] shell.showItemInFolder:", path);
			alert(`[Preview] 无法在浏览器中显示文件夹: ${path}`);
		}
	};
}
/**
* Mock Clipboard 实现
* @returns {Object}
*/
function createMockClipboard() {
	return {
		readText: async () => {
			try {
				return await navigator.clipboard.readText();
			} catch (e) {
				console.warn("[Preview Mock] clipboard.readText failed:", e);
				return "";
			}
		},
		writeText: async (text) => {
			try {
				await navigator.clipboard.writeText(text);
				console.log("[Preview Mock] clipboard.writeText:", text);
			} catch (e) {
				console.warn("[Preview Mock] clipboard.writeText failed:", e);
			}
		},
		readImage: async () => {
			console.log("[Preview Mock] clipboard.readImage: not supported in preview");
			return null;
		},
		writeImage: async () => {
			console.log("[Preview Mock] clipboard.writeImage: not supported in preview");
		}
	};
}
/**
* Mock Window Control 实现
* @returns {Object}
*/
function createMockWindowControl() {
	return {
		close: (windowId) => {
			console.log("[Preview Mock] windowControl.close:", windowId);
		},
		minimize: (windowId) => {
			console.log("[Preview Mock] windowControl.minimize:", windowId);
		},
		maximize: (windowId) => {
			console.log("[Preview Mock] windowControl.maximize:", windowId);
		},
		unmaximize: (windowId) => {
			console.log("[Preview Mock] windowControl.unmaximize:", windowId);
		},
		devtools: (windowId) => {
			console.log("[Preview Mock] windowControl.devtools:", windowId);
		},
		isMaximized: async (windowId) => {
			console.log("[Preview Mock] windowControl.isMaximized:", windowId);
			return false;
		}
	};
}
/**
* Mock Plugin Settings 实现（使用 localStorage 持久化）
* @returns {Object}
*/
function createMockPluginSettings() {
	return {
		get: async (pluginId) => {
			const key = `${STORAGE_PREFIX}${pluginId}`;
			try {
				const data = localStorage.getItem(key);
				return data ? JSON.parse(data) : {};
			} catch (e) {
				console.warn("[Preview Mock] getPluginSetting parse error:", e);
				return {};
			}
		},
		set: async (pluginId, settings) => {
			const key = `${STORAGE_PREFIX}${pluginId}`;
			try {
				localStorage.setItem(key, JSON.stringify(settings));
				console.log("[Preview Mock] setPluginSetting:", pluginId, settings);
			} catch (e) {
				console.warn("[Preview Mock] setPluginSetting error:", e);
			}
		}
	};
}
/**
* Mock Logger 实现
* @returns {Object}
*/
function createMockLogger() {
	return {
		log: (...args) => console.log("[Preview]", ...args),
		info: (...args) => console.info("[Preview]", ...args),
		warn: (...args) => console.warn("[Preview]", ...args),
		error: (...args) => console.error("[Preview]", ...args),
		debug: (...args) => console.debug("[Preview]", ...args)
	};
}
/**
* 创建完整的 mock electron 对象
* @returns {Object}
*/
function createMockElectron() {
	const mockIpc = createMockIpc();
	return {
		useIpc: () => mockIpc,
		dialog: createMockDialog(),
		shell: createMockShell(),
		clipboard: createMockClipboard(),
		openLink: async (url) => {
			console.log("[Preview Mock] openLink:", url);
			window.open(url, "_blank");
		},
		versions: {
			node: "preview",
			chrome: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || "unknown",
			electron: "preview"
		},
		APP_ROOT: "/preview",
		APPDATA_PATH: "/preview/appdata"
	};
}
/**
* 创建完整的 mock ts 对象
* @returns {Object}
*/
function createMockTs() {
	const pluginSettings = createMockPluginSettings();
	return {
		getPluginSetting: pluginSettings.get,
		setPluginSetting: pluginSettings.set,
		windowControl: createMockWindowControl(),
		logger: createMockLogger(),
		net: { request: async (url, options) => {
			console.log("[Preview Mock] net.request:", url, options);
			try {
				const response = await fetch(url, options);
				return {
					ok: response.ok,
					status: response.status,
					data: await response.text()
				};
			} catch (e) {
				return {
					ok: false,
					status: 0,
					error: e.message
				};
			}
		} }
	};
}
/**
* 初始化 preview mock 环境
* 将 mock 对象注入到 window
*/
function initPreviewMock() {
	if (typeof window === "undefined") return;
	if (!window.electron) {
		window.electron = createMockElectron();
		console.log("[Preview Mock] window.electron injected");
	}
	if (!window.ts) {
		window.ts = createMockTs();
		console.log("[Preview Mock] window.ts injected");
	}
}
/**
* 检查当前是否为 preview 模式
* @returns {boolean}
*/
function isPreviewMode() {
	if (typeof __TRANSLIME_PREVIEW__ !== "undefined" && __TRANSLIME_PREVIEW__) return true;
	if (typeof window !== "undefined" && !window.electron && !window.ts) return true;
	return false;
}
//#endregion
//#region ../sdk/dist/index.js
if (typeof window !== "undefined" && isPreviewMode()) initPreviewMock();
/**
* @typedef {Object} MainStore
* @property {Object} config
* @property {function(string, *): *} config.get
* @property {function(string, *): void} config.set
* @property {Object} [logger]
*/
/**
* 获取主程序 Store
* @description 仅在 **主进程 (Main Process)** 环境可用
* @returns {MainStore|null} 若在非主进程环境调用，返回 null
*/
function getMainStore() {
	if (typeof global !== "undefined" && global.mainStore) return global.mainStore;
	return null;
}
/**
* 使用插件配置代理
* @description 获取针对特定插件的配置读写对象
* @param {string} pluginId 插件 ID (通常与 package.json 中的 name 一致)
* @returns {{ get: function(string, *): *, set: function(string, *): void }}
*/
function usePluginConfig(pluginId) {
	const store = getMainStore();
	return {
		get(key, defaultValue) {
			return store?.config?.get(`plugin.${pluginId}.settings.${key}`, defaultValue);
		},
		set(key, value) {
			store?.config?.set(`plugin.${pluginId}.settings.${key}`, value);
		}
	};
}
/**
* 获取插件间通信工具
* @description 仅在 **主进程 (Main Process)** 环境可用
* @returns {import('./index.d').PluginInterop|null}
*/
function usePluginInterop() {
	if (typeof global !== "undefined" && global.pluginInterop) return global.pluginInterop;
	return null;
}
/**
* 获取日志工具
* @description 自动适配 Node.js 环境 (Main) 或浏览器环境 (Renderer)
* @returns {Record<'log'|'info'|'warn'|'error'|'debug', Function>} Console-like logger
*/
function useLogger() {
	if (typeof global !== "undefined" && global.mainStore) return global.mainStore?.logger || console;
	if (typeof window !== "undefined") return window.ts?.logger || console;
	return console;
}
//#endregion
//#region index.js
var id = "translime-plugin-example";
var baseLogger = useLogger();
var logger = baseLogger.child ? baseLogger.child({
	plugin_id: id,
	context: "Main"
}) : baseLogger;
var pluginConfig = usePluginConfig(id);
var captureCompleteListener = null;
var activeHdrApi = null;
var registerHdrCaptureListener = (hdrApi) => {
	if (!hdrApi) return;
	if (activeHdrApi && captureCompleteListener) activeHdrApi.offCaptureComplete(captureCompleteListener);
	captureCompleteListener = ({ path, hdrPath, type }) => {
		logger.info(`[${id}] 截图完成: type=${type}, path=${path}, hdrPath=${hdrPath}`);
	};
	hdrApi.onCaptureComplete(captureCompleteListener);
	activeHdrApi = hdrApi;
};
var unregisterHdrCaptureListener = () => {
	if (activeHdrApi && captureCompleteListener) activeHdrApi.offCaptureComplete(captureCompleteListener);
	captureCompleteListener = null;
	activeHdrApi = null;
};
var activateListener = null;
var pluginDidLoad = () => {
	console.log("plugin loaded");
	const setting = pluginConfig.get("setting", {});
	console.log("settings: ", setting);
	const interop = usePluginInterop();
	if (interop) {
		registerHdrCaptureListener(interop.getExports("translime-plugin-hdr-capture"));
		activateListener = (pluginId, exports) => {
			if (pluginId === "translime-plugin-hdr-capture") {
				console.log(`[${id}] 监听到 HDR 截图插件激活，重新注册监听器`);
				registerHdrCaptureListener(exports);
			}
		};
		interop.on("activated", activateListener);
	}
};
var pluginWillUnload = () => {
	console.log("plugin unloaded");
	unregisterHdrCaptureListener();
	const interop = usePluginInterop();
	if (interop && activateListener) {
		interop.off("activated", activateListener);
		activateListener = null;
	}
};
var pluginSettingSaved = () => {
	console.log("plugin setting saved");
};
var settingMenu = [
	{
		key: "input-1",
		type: "input",
		name: "文本1",
		required: false,
		placeholder: "输入提示"
	},
	{
		type: "password",
		name: "密码",
		required: true,
		placeholder: "请输入密码"
	},
	{
		type: "switch",
		name: "开关"
	},
	{
		type: "checkbox",
		name: "复选",
		choices: [
			{
				name: "选择1",
				value: "foo"
			},
			{
				name: "选择2",
				value: "bar"
			},
			{ name: "选择3" }
		]
	},
	{
		type: "radio",
		name: "单选",
		choices: ["foo", "bar"]
	},
	{
		type: "list",
		name: "下拉菜单",
		required: true,
		choices: ["foo", "bar"]
	},
	{
		key: "file-1",
		type: "file",
		name: "文件选择1",
		required: false,
		valueType: "array",
		placeholder: "输入提示",
		dialogOptions: {
			filters: [
				{
					name: "图片",
					extensions: [
						"jpg",
						"png",
						"gif"
					]
				},
				{
					name: "视频",
					extensions: [
						"mkv",
						"avi",
						"mp4"
					]
				},
				{
					name: "所有文件",
					extensions: ["*"]
				}
			],
			properties: [
				"openFile",
				"multiSelections",
				"dontAddToRecent"
			]
		}
	}
];
var pluginMenu = [{
	id: `${id}-custom-menu`,
	label: "custom menu",
	click() {
		console.log("custom menu clicked");
	}
}];
var ipcHandlers = [{
	type: "test-ipc",
	handler: ({ sendToClient }) => (arg1, arg2) => {
		console.log("test-ipc", "test ipc from plugin: ", arg1, arg2);
		sendToClient(`test-ipc-reply@${id}`, "test ipc reply from plugin");
	}
}];
var bus = new node_events.default();
var counter = 0;
var libs = {
	getCounter: () => counter,
	increment: () => {
		counter += 1;
		bus.emit("counter-changed", counter);
	},
	onCounterChanged: (fn) => bus.on("counter-changed", fn),
	offCounterChanged: (fn) => bus.off("counter-changed", fn)
};
var template_translime_plugin_default = {
	pluginDidLoad,
	pluginWillUnload,
	pluginSettingSaved,
	settingMenu,
	pluginMenu,
	ipcHandlers,
	commands: [{
		id: "translime-plugin-example.increment-counter",
		handler() {
			libs.increment();
			return libs.getCounter();
		}
	}],
	libs
};
//#endregion
module.exports = template_translime_plugin_default;
