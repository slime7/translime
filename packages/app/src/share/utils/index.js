/**
 * 输出格式化日期时间
 * @param targetTime 目标时间或 null 则为当前时间
 * @param format 日期分隔符，空字符则为中文
 * @param showTime 是否显示时间
 * @param showYear 是否显示年份
 * @param showSecond 是否显示秒
 * @returns {string}
 */
export const myDate = (
  targetTime = null,
  {
    format = '',
    showTime = false,
    showYear = true,
    showSecond = false,
  } = {},
) => {
  let time;
  const date = [
    '0', // 年
    '0', // 月
    '0', // 日
    '0', // 时
    '0', // 分
  ];
  if (targetTime === null) {
    time = new Date();
  } else {
    time = new Date(+targetTime * 1000);
  }

  date[0] = `${time.getFullYear()}`.padStart(2, '0');
  date[1] = `${time.getMonth() + 1}`.padStart(2, '0');
  date[2] = `${time.getDate()}`.padStart(2, '0');
  date[3] = `${time.getHours()}`.padStart(2, '0');
  date[4] = `${time.getMinutes()}`.padStart(2, '0');
  date[5] = `${time.getSeconds()}`.padStart(2, '0');

  let result = '';
  if (showYear) {
    result += date[0] + (format === '' ? '年' : format);
  }
  if (format === '') {
    result += `${date[1]}月${date[2]}日`;
  } else {
    result += [date[1], date[2]].join(format);
  }
  if (showTime && !showSecond) {
    result += ` ${[date[3], date[4]].join(':')}`;
  } else if (showTime && showSecond) {
    result += ` ${[date[3], date[4], date[5]].join(':')}`;
  }
  return result;
};

export const wait = (time) => new Promise((resolve, reject) => {
  try {
    setTimeout(() => {
      resolve(true);
    }, time * 1000);
  } catch (err) {
    reject(err);
  }
});

/**
 * api 错误帮助方法
 * @param {Error} error 错误
 * @param {Object} appendData 附加数据
 * @returns {Error} new error
 */
export const apiError = (error, appendData = {}) => {
  /* eslint-disable no-param-reassign */
  if (typeof error === 'string') {
    error = new Error(error);
  }
  Object.keys(appendData).forEach((dataKey) => {
    error[dataKey] = appendData[dataKey];
  });
  /* eslint-enable no-param-reassign */
  return error;
};

export const randomNumber = (start, end = null) => {
  const range = end ? end - start : start;
  const base = end ? start : 0;
  return Math.round(Math.random() * range + 0.5 + base);
};

export const getUuiD = (randomLength = 8) => Number(Math.random().toString().substring(2, 2 + randomLength) + +Date.now()).toString(36);
