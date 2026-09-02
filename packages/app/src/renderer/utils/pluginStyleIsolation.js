const STYLE_NODE_TAGS = new Set(['STYLE', 'LINK']);
const PROCESSED_ATTR = 'data-translime-style-processed';
const PLUGIN_ID_ATTR = 'data-translime-plugin-id';
const LEGACY_PLUGIN_STYLE_ID_ATTR = 'data-plugin-style-id';
const ACTIVE_PLUGIN_STACK = [];
const ROOT_SELECTOR_PREFIX = '.plugin-ui-loader[data-plugin-id="';
const HOST_ROOT_SELECTOR_RE = /^(?::root|:host|html|body)(?=[\s.#:[>+~(]|$)/;
const AT_RULE_WITH_NESTED_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
  'document',
  '-moz-document',
]);
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

const findMatchingParenthesis = (source, openIndex) => {
  let depth = 0;
  let quote = '';
  let inComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];
    const prevChar = source[index - 1];

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index += 1;
      }
    } else if (quote) {
      if (char === quote && prevChar !== '\\') {
        quote = '';
      }
    } else if (char === '/' && nextChar === '*') {
      inComment = true;
      index += 1;
    } else if (char === '"' || char === '\'') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
};

const mapTopLevelSelectorList = (selectorText, mapper) => {
  let output = '';
  let segmentStart = 0;
  let parenthesesDepth = 0;
  let bracketsDepth = 0;
  let quote = '';
  let inComment = false;

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    const nextChar = selectorText[index + 1];
    const prevChar = selectorText[index - 1];

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index += 1;
      }
    } else if (quote) {
      if (char === quote && prevChar !== '\\') {
        quote = '';
      }
    } else if (char === '/' && nextChar === '*') {
      inComment = true;
      index += 1;
    } else if (char === '"' || char === '\'') {
      quote = char;
    } else if (char === '\\') {
      index += 1;
    } else if (char === '(') {
      parenthesesDepth += 1;
    } else if (char === ')') {
      parenthesesDepth -= 1;
    } else if (char === '[') {
      bracketsDepth += 1;
    } else if (char === ']') {
      bracketsDepth -= 1;
    } else if (char === ',' && parenthesesDepth === 0 && bracketsDepth === 0) {
      output += `${mapper(selectorText.slice(segmentStart, index))},`;
      segmentStart = index + 1;
    }
  }

  return output + mapper(selectorText.slice(segmentStart));
};

const normalizeHostRootSelector = (selector) => {
  const rootMatch = selector.match(HOST_ROOT_SELECTOR_RE);
  if (!rootMatch) {
    return selector;
  }

  const rootSelector = rootMatch[0];
  let rest = selector.slice(rootSelector.length);

  if (rootSelector === ':host' && rest.startsWith('(')) {
    const closeIndex = findMatchingParenthesis(rest, 0);
    if (closeIndex !== -1) {
      rest = `${rest.slice(1, closeIndex)}${rest.slice(closeIndex + 1)}`;
    }
  }

  return `:scope${rest}`;
};

const normalizeRootSelectorList = (selectorText) => mapTopLevelSelectorList(
  selectorText,
  (selector) => {
    const leadingWhitespace = selector.match(/^\s*/)?.[0] || '';
    const trailingWhitespace = selector.match(/\s*$/)?.[0] || '';
    const trimmedSelector = selector.slice(
      leadingWhitespace.length,
      selector.length - trailingWhitespace.length,
    );

    if (!trimmedSelector) {
      return selector;
    }

    return `${leadingWhitespace}${normalizeHostRootSelector(trimmedSelector)}${trailingWhitespace}`;
  },
);

const findMatchingBrace = (source, openIndex) => {
  let depth = 0;
  let quote = '';
  let inComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];
    const prevChar = source[index - 1];

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index += 1;
      }
    } else if (quote) {
      if (char === quote && prevChar !== '\\') {
        quote = '';
      }
    } else if (char === '/' && nextChar === '*') {
      inComment = true;
      index += 1;
    } else if (char === '"' || char === '\'') {
      quote = char;
    } else if (char === '\\') {
      index += 1;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
};

const findLastTopLevelSemicolon = (source) => {
  let lastIndex = -1;
  let parenthesesDepth = 0;
  let bracketsDepth = 0;
  let quote = '';
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];
    const prevChar = source[index - 1];

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index += 1;
      }
    } else if (quote) {
      if (char === quote && prevChar !== '\\') {
        quote = '';
      }
    } else if (char === '/' && nextChar === '*') {
      inComment = true;
      index += 1;
    } else if (char === '"' || char === '\'') {
      quote = char;
    } else if (char === '\\') {
      index += 1;
    } else if (char === '(') {
      parenthesesDepth += 1;
    } else if (char === ')') {
      parenthesesDepth -= 1;
    } else if (char === '[') {
      bracketsDepth += 1;
    } else if (char === ']') {
      bracketsDepth -= 1;
    } else if (char === ';' && parenthesesDepth === 0 && bracketsDepth === 0) {
      lastIndex = index;
    }
  }

  return lastIndex;
};

const getLeadingTriviaEnd = (source) => {
  let index = 0;

  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source[index] === '/' && source[index + 1] === '*') {
      const closeIndex = source.indexOf('*/', index + 2);
      if (closeIndex === -1) {
        return source.length;
      }
      index = closeIndex + 2;
    } else {
      break;
    }
  }

  return index;
};

const getAtRuleName = (prelude) => {
  const trimmedPrelude = prelude.slice(getLeadingTriviaEnd(prelude)).trimStart();
  const match = trimmedPrelude.match(/^@([\w-]+)/);
  return match?.[1].toLowerCase() || '';
};

const normalizePluginRootSelectors = (cssText) => {
  const processCssBlock = (source) => {
    let output = '';
    let cursor = 0;
    let quote = '';
    let inComment = false;
    let parenthesesDepth = 0;
    let bracketsDepth = 0;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];
      const prevChar = source[index - 1];

      if (inComment) {
        if (char === '*' && nextChar === '/') {
          inComment = false;
          index += 1;
        }
      } else if (quote) {
        if (char === quote && prevChar !== '\\') {
          quote = '';
        }
      } else if (char === '/' && nextChar === '*') {
        inComment = true;
        index += 1;
      } else if (char === '"' || char === '\'') {
        quote = char;
      } else if (char === '\\') {
        index += 1;
      } else if (char === '(') {
        parenthesesDepth += 1;
      } else if (char === ')') {
        parenthesesDepth -= 1;
      } else if (char === '[') {
        bracketsDepth += 1;
      } else if (char === ']') {
        bracketsDepth -= 1;
      } else if (parenthesesDepth === 0 && bracketsDepth === 0 && char === '{') {
        const prelude = source.slice(cursor, index);
        const closeIndex = findMatchingBrace(source, index);

        if (closeIndex === -1) {
          return output + source.slice(cursor);
        }

        const blockContent = source.slice(index + 1, closeIndex);
        const lastSemicolon = findLastTopLevelSemicolon(prelude);
        const statementPrefix = prelude.slice(0, lastSemicolon + 1);
        const currentPrelude = prelude.slice(lastSemicolon + 1);
        const atRuleName = getAtRuleName(currentPrelude);
        const normalizedPrelude = atRuleName
          ? currentPrelude
          : normalizeRootSelectorList(currentPrelude);
        const normalizedContent = AT_RULE_WITH_NESTED_RULES.has(atRuleName)
          ? processCssBlock(blockContent)
          : blockContent;

        output += `${statementPrefix}${normalizedPrelude}{${normalizedContent}}`;
        cursor = closeIndex + 1;
        index = closeIndex;
      }
    }

    return output + source.slice(cursor);
  };

  return processCssBlock(cssText);
};

const wrapPluginLayer = (cssText) => `@layer ${HOST_PLUGIN_LAYER_NAME} {\n${cssText}\n}`;

const wrapPluginCssInScope = (cssText, pluginId) => {
  const normalizedCss = normalizePluginRootSelectors(cssText);
  return `@layer ${HOST_PLUGIN_LAYER_NAME} {\n  @scope (${getScopeSelector(pluginId)}) {\n${normalizedCss}\n  }\n}`;
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
    const isLegacyBuildScopedStyle = node.getAttribute(LEGACY_PLUGIN_STYLE_ID_ATTR) === pluginId;
    const scopedCss = isLegacyBuildScopedStyle
      ? wrapPluginLayer(cssContent)
      : wrapPluginCssInScope(cssContent, pluginId);
    const styleNode = node;
    styleNode.textContent = scopedCss;
    styleNode.setAttribute(PROCESSED_ATTR, 'true');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[CSS Isolation] Failed to scope style for ${pluginId}:`, error);
  }
};

const processLinkElement = async (node, pluginId) => {
  const { href } = node;
  if (!href) {
    return;
  }

  try {
    const response = await fetch(href);
    const cssContent = await response.text();
    const scopedCss = wrapPluginCssInScope(cssContent, pluginId);
    const styleElement = document.createElement('style');
    styleElement.id = node.id || `${pluginId}-scoped-link-style`;
    styleElement.textContent = scopedCss;
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
