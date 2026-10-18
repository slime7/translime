import { createElementBlock, createElementVNode, createTextVNode, createVNode, onMounted, openBlock, ref, toDisplayString, unref, vModelText, withCtx, withDirectives } from "vue";
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
	return true;
}
//#endregion
//#region ../sdk/dist/index.js
if (typeof window !== "undefined" && isPreviewMode()) initPreviewMock();
/**
* 获取宿主提供的 mde-vue 运行时
* @description 仅在 **渲染进程** 环境可用
* @returns {Object} mde-vue 运行时对象
*/
function useMat() {
	if (typeof window !== "undefined" && window.mde$) return window.mde$;
	return {};
}
/**
* 获取全局注册的 mde-vue 组件
* @returns {Record<string, any>}
*/
function useMatComponents() {
	return useMat().components || {};
}
/**
* 获取全局注册的 mde-vue 指令
* @returns {Record<string, any>}
*/
function useMatDirectives() {
	return useMat().directives || {};
}

/**
* 获取插件自身设置 (IPC 封装)
* @description 仅在 **渲染进程** 环境可用。这是 `plugin.settings` 的前端读取接口。
* @param {...any} args
* @returns {Promise<any>}
*/
async function getPluginSetting(...args) {
	if (typeof window !== "undefined" && window.ts?.getPluginSetting) return window.ts.getPluginSetting(...args);
	return null;
}
//#endregion
//#region \0plugin-vue:export-helper
var _plugin_vue_export_helper_default = (sfc, props) => {
	const target = sfc.__vccOpts || sfc;
	for (const [key, val] of props) target[key] = val;
	return target;
};
//#endregion
//#region ui.vue
var _hoisted_1 = { class: "plugin-main" };
var _hoisted_2 = { class: "red" };
var ui_default = /*#__PURE__*/ _plugin_vue_export_helper_default(/* @__PURE__ */ Object.assign({ name: "UiExample" }, {
	__name: "ui",
	setup(__props) {
		const { MatBtn } = typeof window !== "undefined" && window.mde$?.components || {};
		const setting = ref({});
		const input = ref("");
		const msg = ref("hello");
		const showMat = () => {
			console.log(useMatComponents(), useMatDirectives());
		};
		onMounted(async () => {
			setting.value = await getPluginSetting("translime-plugin-example");
		});
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1, [
				createElementVNode("div", _hoisted_2, " plugin content " + toDisplayString(msg.value) + " " + toDisplayString(input.value), 1),
				createElementVNode("div", null, [withDirectives(createElementVNode("input", { "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => input.value = $event) }, null, 512), [[vModelText, input.value]])]),
				createElementVNode("pre", null, toDisplayString(setting.value), 1),
				createVNode(unref(MatBtn), {
					color: "primary",
					onClick: showMat
				}, {
					default: withCtx(() => [..._cache[1] || (_cache[1] = [createTextVNode(" mde component ", -1)])]),
					_: 1
				})
			]);
		};
	}
}), [["__scopeId", "data-v-3019354c"]]);
//#endregion
export { ui_default as default };

