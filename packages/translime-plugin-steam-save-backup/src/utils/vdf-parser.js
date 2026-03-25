/**
 * 简单的 Valve VDF (KeyValues) 格式解析器
 * 内置实现，避免外部依赖打包问题
 *
 * Steam ACF/VDF 文件格式示例：
 * "AppState"
 * {
 *     "appid"  "582010"
 *     "name"  "Monster Hunter: World"
 *     "installdir"  "Monster Hunter World"
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

  let cleanText = text;
  // 移除 BOM
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  let pos = 0;

  /**
   * 跳过空白字符和注释
   */
  function skipWhitespace() {
    while (pos < cleanText.length) {
      const ch = cleanText[pos];
      // 跳过空白
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        pos += 1;
      } else if (ch === '/' && cleanText[pos + 1] === '/') {
        // 跳过单行注释
        while (pos < cleanText.length && cleanText[pos] !== '\n') {
          pos += 1;
        }
      } else {
        break;
      }
    }
  }

  /**
   * 解析带引号的字符串
   * @returns {string}
   */
  function parseQuotedString() {
    if (cleanText[pos] !== '"') {
      throw new Error(`期望 '"'，但得到 '${cleanText[pos]}' 在位置 ${pos}`);
    }
    pos += 1; // 跳过开始的引号

    let result = '';
    while (pos < cleanText.length) {
      const ch = cleanText[pos];
      if (ch === '"') {
        pos += 1; // 跳过结束的引号
        return result;
      }
      if (ch === '\\' && pos + 1 < cleanText.length) {
        // 处理转义字符
        pos += 1;
        const escaped = cleanText[pos];
        switch (escaped) {
        case 'n':
          result += '\n';
          break;
        case 't':
          result += '\t';
          break;
        case '\\':
          result += '\\';
          break;
        case '"':
          result += '"';
          break;
        default:
          result += escaped;
        }
        pos += 1;
      } else {
        result += ch;
        pos += 1;
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
    while (pos < cleanText.length) {
      const ch = cleanText[pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
        || ch === '{' || ch === '}' || ch === '"') {
        break;
      }
      result += ch;
      pos += 1;
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
    if (cleanText[pos] === '{') {
      pos += 1; // 跳过 {
    }

    while (pos < cleanText.length) {
      skipWhitespace();

      if (pos >= cleanText.length) break;

      // 检查对象结束
      if (cleanText[pos] === '}') {
        pos += 1; // 跳过 }
        return result;
      }

      // 解析键
      let key;
      if (cleanText[pos] === '"') {
        key = parseQuotedString();
      } else {
        key = parseUnquotedString();
        if (!key) {
          pos += 1;
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      skipWhitespace();

      // 检查值的类型
      if (cleanText[pos] === '{') {
        // 子对象
        pos += 1; // 跳过 {
        result[key] = parseObject();
      } else if (cleanText[pos] === '"') {
        // 字符串值
        result[key] = parseQuotedString();
      } else if (cleanText[pos] !== '}' && cleanText[pos] !== undefined) {
        // 不带引号的值
        result[key] = parseUnquotedString();
      }
    }

    return result;
  }

  skipWhitespace();

  // 处理根级别的键值对
  const root = {};

  while (pos < cleanText.length) {
    skipWhitespace();
    if (pos >= cleanText.length) break;

    // 解析根级别的键
    let key;
    if (cleanText[pos] === '"') {
      key = parseQuotedString();
    } else if (cleanText[pos] === '{' || cleanText[pos] === '}') {
      pos += 1;
      // eslint-disable-next-line no-continue
      continue;
    } else {
      key = parseUnquotedString();
      if (!key) {
        pos += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    skipWhitespace();

    // 解析值
    if (cleanText[pos] === '{') {
      pos += 1; // 跳过 {
      root[key] = parseObject();
    } else if (cleanText[pos] === '"') {
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

  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      result += `${tabs}"${key}"\n`;
      result += `${tabs}{\n`;
      result += stringify(value, indent + 1);
      result += `${tabs}}\n`;
    } else {
      result += `${tabs}"${key}"\t\t"${value}"\n`;
    }
  });

  return result;
}

export default { parse, stringify };
