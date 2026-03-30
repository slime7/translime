const STYLE_NODE_TAGS = new Set(['STYLE', 'LINK']);
const PROCESSED_ATTR = 'data-translime-style-processed';
const PLUGIN_ID_ATTR = 'data-translime-plugin-id';
const ACTIVE_PLUGIN_STACK = [];
const ROOT_SELECTOR_PREFIX = '.plugin-ui-loader[data-plugin-id="';
const HOST_ROOT_SELECTOR_RE = /^(?:\s)*(?::root|html|body)(?=[\s.#:[>+~]|$)/;
const LEADING_COMBINATOR_RE = /^(?:\s)*(?:[>+~])(?:\s)*/;
const EVENT_LISTENER_MAP = new WeakMap();
const HOST_PLUGIN_LAYER_NAME = 'translime-plugin';

const getCurrentPluginId = () => ACTIVE_PLUGIN_STACK[ACTIVE_PLUGIN_STACK.length - 1] || '';

const escapeAttributeValue = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getScopeSelector = (pluginId) => `${ROOT_SELECTOR_PREFIX}${escapeAttributeValue(pluginId)}"]`;

const withPluginRuntimeContext = (pluginId, callback, ...args) => {
  if (!pluginId || typeof callback !== 'function') {
    return callback?.(...args);
  }

  ACTIVE_PLUGIN_STACK.push(pluginId);
  try {
    return callback(...args);
  } finally {
    ACTIVE_PLUGIN_STACK.pop();
  }
};

const wrapCallbackWithPluginContext = (callback, pluginId) => {
  if (!pluginId || typeof callback !== 'function') {
    return callback;
  }

  return function wrappedCallback(...args) {
    return withPluginRuntimeContext(pluginId, callback, ...args);
  };
};

const splitSelectors = (selectorText) => {
  const selectors = [];
  let current = '';
  let parenthesesDepth = 0;
  let bracketsDepth = 0;
  let bracesDepth = 0;
  let quote = '';

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    const prevChar = selectorText[index - 1];

    current += char;

    if (quote) {
      if (char === quote && prevChar !== '\\') {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '(') {
      parenthesesDepth += 1;
      continue;
    }
    if (char === ')') {
      parenthesesDepth -= 1;
      continue;
    }
    if (char === '[') {
      bracketsDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketsDepth -= 1;
      continue;
    }
    if (char === '{') {
      bracesDepth += 1;
      continue;
    }
    if (char === '}') {
      bracesDepth -= 1;
      continue;
    }

    if (char === ',' && parenthesesDepth === 0 && bracketsDepth === 0 && bracesDepth === 0) {
      selectors.push(current.slice(0, -1));
      current = '';
    }
  }

  if (current.trim()) {
    selectors.push(current);
  }

  return selectors;
};

const stripHostRootSelector = (selector) => {
  let nextSelector = selector.trim();

  while (HOST_ROOT_SELECTOR_RE.test(nextSelector)) {
    nextSelector = nextSelector.replace(HOST_ROOT_SELECTOR_RE, '').trimStart();
    nextSelector = nextSelector.replace(LEADING_COMBINATOR_RE, '').trimStart();
  }

  return nextSelector;
};

const scopeSelector = (selector, scopeSelectorText) => {
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) {
    return scopeSelectorText;
  }

  if (trimmedSelector.startsWith(scopeSelectorText)) {
    return trimmedSelector;
  }

  if (trimmedSelector === '::backdrop') {
    return trimmedSelector;
  }

  const withoutHostRoot = stripHostRootSelector(trimmedSelector);
  if (!withoutHostRoot) {
    return scopeSelectorText;
  }

  return `${scopeSelectorText} ${withoutHostRoot}`;
};

const scopeSelectorText = (selectorText, pluginId) => {
  const scopeSelectorTextValue = getScopeSelector(pluginId);
  return splitSelectors(selectorText)
    .map((selector) => scopeSelector(selector, scopeSelectorTextValue))
    .join(', ');
};

const normalizeLayerName = (layerName = '') => layerName.replace(/_/g, '-');

const normalizeLayerNameList = (layerNameList = '') => layerNameList
  .split(',')
  .map((name) => normalizeLayerName(name.trim()))
  .join(', ');

const serializeCssRule = (rule, pluginId) => {
  if (rule instanceof CSSStyleRule) {
    return `${scopeSelectorText(rule.selectorText, pluginId)} { ${rule.style.cssText} }`;
  }

  if (rule instanceof CSSMediaRule) {
    const content = Array.from(rule.cssRules).map((childRule) => serializeCssRule(childRule, pluginId)).join('\n');
    return `@media ${rule.conditionText} {\n${content}\n}`;
  }

  if (rule instanceof CSSSupportsRule) {
    const content = Array.from(rule.cssRules).map((childRule) => serializeCssRule(childRule, pluginId)).join('\n');
    return `@supports ${rule.conditionText} {\n${content}\n}`;
  }

  if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
    const content = Array.from(rule.cssRules).map((childRule) => serializeCssRule(childRule, pluginId)).join('\n');
    return `@layer ${normalizeLayerName(rule.name)} {\n${content}\n}`;
  }

  if (typeof CSSLayerStatementRule !== 'undefined' && rule instanceof CSSLayerStatementRule) {
    return `@layer ${normalizeLayerNameList(rule.name)};`;
  }

  if (rule instanceof CSSContainerRule) {
    const content = Array.from(rule.cssRules).map((childRule) => serializeCssRule(childRule, pluginId)).join('\n');
    return `@container ${rule.conditionText} {\n${content}\n}`;
  }

  if (rule instanceof CSSKeyframesRule || rule instanceof CSSFontFaceRule || rule instanceof CSSPropertyRule) {
    return rule.cssText;
  }

  if (typeof CSSImportRule !== 'undefined' && rule instanceof CSSImportRule) {
    return rule.cssText;
  }

  if (rule.cssRules) {
    const content = Array.from(rule.cssRules).map((childRule) => serializeCssRule(childRule, pluginId)).join('\n');
    return `${rule.cssText.replace(/\{\s*$/, '{')}\n${content}\n}`;
  }

  return rule.cssText;
};

const scopeCssText = (cssText, pluginId) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  return Array.from(sheet.cssRules)
    .map((rule) => serializeCssRule(rule, pluginId))
    .join('\n');
};

const resolvePluginIdFromNode = (node) => {
  if (!node || !(node instanceof Element)) {
    return '';
  }

  if (node.getAttribute(PLUGIN_ID_ATTR)) {
    return node.getAttribute(PLUGIN_ID_ATTR) || '';
  }

  if (node.id?.startsWith('translime-plugin-')) {
    return node.id;
  }

  return getCurrentPluginId();
};

const markNodeWithPluginId = (node, pluginId) => {
  if (!node || !(node instanceof Element) || !pluginId) {
    return;
  }

  node.setAttribute(PLUGIN_ID_ATTR, pluginId);
};

const processStyleElement = (node, pluginId) => {
  const cssContent = node.textContent;
  if (!cssContent) {
    return;
  }

  try {
    const scopedCss = scopeCssText(cssContent, pluginId);
    node.textContent = `@layer ${HOST_PLUGIN_LAYER_NAME} {\n${scopedCss}\n}`;
    node.setAttribute(PROCESSED_ATTR, 'true');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[CSS Isolation] Failed to scope style for ${pluginId}:`, error);
  }
};

const processLinkElement = async (node, pluginId) => {
  const href = node.href;
  if (!href) {
    return;
  }

  try {
    const response = await fetch(href);
    const cssContent = await response.text();
    const scopedCss = scopeCssText(cssContent, pluginId);
    const styleElement = document.createElement('style');
    styleElement.id = node.id || `${pluginId}-scoped-link-style`;
    styleElement.textContent = `@layer ${HOST_PLUGIN_LAYER_NAME} {\n${scopedCss}\n}`;
    styleElement.setAttribute(PLUGIN_ID_ATTR, pluginId);
    styleElement.setAttribute(PROCESSED_ATTR, 'true');
    node.replaceWith(styleElement);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[CSS Isolation] Failed to scope stylesheet link for ${pluginId}:`, error);
  }
};

const processNode = (node) => {
  if (!node || !(node instanceof Element) || node.getAttribute(PROCESSED_ATTR) === 'true') {
    return;
  }

  const pluginId = resolvePluginIdFromNode(node);
  if (!pluginId) {
    return;
  }

  markNodeWithPluginId(node, pluginId);

  if (node.tagName === 'STYLE') {
    processStyleElement(node, pluginId);
    return;
  }

  if (node.tagName === 'LINK' && node.getAttribute('rel') === 'stylesheet') {
    processLinkElement(node, pluginId);
  }
};

const processPotentialStyleNode = (node) => {
  if (!node || !(node instanceof Element)) {
    return;
  }

  if (STYLE_NODE_TAGS.has(node.tagName)) {
    processNode(node);
  }

  node.querySelectorAll?.('style,link[rel="stylesheet"]').forEach((childNode) => {
    processNode(childNode);
  });
};

const patchCreateElement = () => {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function patchedCreateElement(tagName, options) {
    const element = originalCreateElement(tagName, options);
    if (typeof tagName === 'string' && STYLE_NODE_TAGS.has(tagName.toUpperCase())) {
      markNodeWithPluginId(element, getCurrentPluginId());
    }
    return element;
  };
};

const patchNodeInsertion = () => {
  const originalAppendChild = Node.prototype.appendChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalReplaceChild = Node.prototype.replaceChild;

  Node.prototype.appendChild = function patchedAppendChild(node) {
    processPotentialStyleNode(node);
    return originalAppendChild.call(this, node);
  };

  Node.prototype.insertBefore = function patchedInsertBefore(node, child) {
    processPotentialStyleNode(node);
    return originalInsertBefore.call(this, node, child);
  };

  Node.prototype.replaceChild = function patchedReplaceChild(node, child) {
    processPotentialStyleNode(node);
    return originalReplaceChild.call(this, node, child);
  };
};

const patchAsyncContext = () => {
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const originalQueueMicrotask = window.queueMicrotask.bind(window);
  const originalThen = Promise.prototype.then;

  window.setTimeout = function patchedSetTimeout(callback, delay, ...args) {
    return originalSetTimeout(wrapCallbackWithPluginContext(callback, getCurrentPluginId()), delay, ...args);
  };

  window.setInterval = function patchedSetInterval(callback, delay, ...args) {
    return originalSetInterval(wrapCallbackWithPluginContext(callback, getCurrentPluginId()), delay, ...args);
  };

  window.requestAnimationFrame = function patchedRequestAnimationFrame(callback) {
    return originalRequestAnimationFrame(wrapCallbackWithPluginContext(callback, getCurrentPluginId()));
  };

  window.queueMicrotask = function patchedQueueMicrotask(callback) {
    return originalQueueMicrotask(wrapCallbackWithPluginContext(callback, getCurrentPluginId()));
  };

  Promise.prototype.then = function patchedThen(onFulfilled, onRejected) {
    const pluginId = getCurrentPluginId();
    return originalThen.call(
      this,
      wrapCallbackWithPluginContext(onFulfilled, pluginId),
      wrapCallbackWithPluginContext(onRejected, pluginId),
    );
  };
};

const patchEventListeners = () => {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    const wrappedListener = wrapCallbackWithPluginContext(listener, getCurrentPluginId());
    if (wrappedListener && wrappedListener !== listener) {
      EVENT_LISTENER_MAP.set(listener, wrappedListener);
    }

    return originalAddEventListener.call(
      this,
      type,
      wrappedListener,
      options,
    );
  };

  EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
    return originalRemoveEventListener.call(
      this,
      type,
      EVENT_LISTENER_MAP.get(listener) || listener,
      options,
    );
  };
};

const installMutationObserver = () => {
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        processPotentialStyleNode(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

let installed = false;

export const installPluginStyleIsolation = () => {
  if (installed) {
    return;
  }

  patchCreateElement();
  patchNodeInsertion();
  patchAsyncContext();
  patchEventListeners();
  installMutationObserver();
  installed = true;
};

export {
  getCurrentPluginId,
  withPluginRuntimeContext,
};
