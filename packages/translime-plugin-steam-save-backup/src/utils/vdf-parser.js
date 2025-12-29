/**
 * 简单的 Valve VDF (KeyValues) 格式解析器
 * 内置实现，避免外部依赖打包问题
 *
 * Steam ACF/VDF 文件格式示例：
 * "AppState"
 * {
 *     "appid"		"582010"
 *     "name"		"Monster Hunter: World"
 *     "installdir"		"Monster Hunter World"
 * }
 */

/**
 * 解析 VDF 格式的字符串
 * @param {string} text - VDF 格式的字符串
 * @returns {object} 解析后的对象
 */
export function parse(text) {
  if (typeof text !== 'string') {
    throw new Error('VDF parse 需要字符串参数');
  }

  // 移除 BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  let pos = 0;

  /**
   * 跳过空白字符和注释
   */
  function skipWhitespace() {
    while (pos < text.length) {
      const ch = text[pos];
      // 跳过空白
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        pos++;
        continue;
      }
      // 跳过单行注释
      if (ch === '/' && text[pos + 1] === '/') {
        while (pos < text.length && text[pos] !== '\n') {
          pos++;
        }
        continue;
      }
      break;
    }
  }

  /**
   * 解析带引号的字符串
   * @returns {string}
   */
  function parseQuotedString() {
    if (text[pos] !== '"') {
      throw new Error(`期望 '"'，但得到 '${text[pos]}' 在位置 ${pos}`);
    }
    pos++; // 跳过开始的引号

    let result = '';
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === '"') {
        pos++; // 跳过结束的引号
        return result;
      }
      if (ch === '\\' && pos + 1 < text.length) {
        // 处理转义字符
        pos++;
        const escaped = text[pos];
        switch (escaped) {
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case '\\': result += '\\'; break;
          case '"': result += '"'; break;
          default: result += escaped;
        }
        pos++;
      } else {
        result += ch;
        pos++;
      }
    }
    throw new Error('未闭合的字符串');
  }

  /**
   * 解析不带引号的字符串（用于某些旧格式）
   * @returns {string}
   */
  function parseUnquotedString() {
    let result = '';
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
        || ch === '{' || ch === '}' || ch === '"') {
        break;
      }
      result += ch;
      pos++;
    }
    return result;
  }

  /**
   * 解析一个对象
   * @returns {object}
   */
  function parseObject() {
    const result = {};

    skipWhitespace();

    // 检查是否有开始的 {
    if (text[pos] === '{') {
      pos++; // 跳过 {
    }

    while (pos < text.length) {
      skipWhitespace();

      if (pos >= text.length) break;

      // 检查对象结束
      if (text[pos] === '}') {
        pos++; // 跳过 }
        return result;
      }

      // 解析键
      let key;
      if (text[pos] === '"') {
        key = parseQuotedString();
      } else {
        key = parseUnquotedString();
        if (!key) {
          pos++;
          continue;
        }
      }

      skipWhitespace();

      // 检查值的类型
      if (text[pos] === '{') {
        // 子对象
        pos++; // 跳过 {
        result[key] = parseObject();
      } else if (text[pos] === '"') {
        // 字符串值
        result[key] = parseQuotedString();
      } else if (text[pos] !== '}' && text[pos] !== undefined) {
        // 不带引号的值
        result[key] = parseUnquotedString();
      }
    }

    return result;
  }

  skipWhitespace();

  // 处理根级别的键值对
  const root = {};

  while (pos < text.length) {
    skipWhitespace();
    if (pos >= text.length) break;

    // 解析根级别的键
    let key;
    if (text[pos] === '"') {
      key = parseQuotedString();
    } else if (text[pos] === '{' || text[pos] === '}') {
      pos++;
      continue;
    } else {
      key = parseUnquotedString();
      if (!key) {
        pos++;
        continue;
      }
    }

    skipWhitespace();

    // 解析值
    if (text[pos] === '{') {
      pos++; // 跳过 {
      root[key] = parseObject();
    } else if (text[pos] === '"') {
      root[key] = parseQuotedString();
    } else {
      root[key] = parseUnquotedString();
    }
  }

  return root;
}

/**
 * 将对象转换为 VDF 格式字符串
 * @param {object} obj - 要转换的对象
 * @param {number} indent - 缩进层级
 * @returns {string} VDF 格式的字符串
 */
export function stringify(obj, indent = 0) {
  const tabs = '\t'.repeat(indent);
  let result = '';

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result += `${tabs}"${key}"\n`;
      result += `${tabs}{\n`;
      result += stringify(value, indent + 1);
      result += `${tabs}}\n`;
    } else {
      result += `${tabs}"${key}"\t\t"${value}"\n`;
    }
  }

  return result;
}

export default { parse, stringify };
