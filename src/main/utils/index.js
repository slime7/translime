export const parseAppArgv = (argv) => {
  if (argv.length < 2) {
    return {};
  }

  const args = {
    extra: [],
  };
  argv.forEach((arg, index) => {
    if (index === 0) {
      args.app = arg;
    } else {
      const lowArg = arg.toLowerCase();
      if (lowArg.startsWith('translime:')) {
        args.url = arg;
      } else if (arg.startsWith('--')) {
        const argSplit = arg.substring(2).split('=');
        if (argSplit.length === 2 && argSplit[0] && argSplit[1]) {
          args[argSplit[0]] = argSplit[1] === 'false' ? false : argSplit[1];
        } else if (argSplit[0]) {
          args[argSplit[0]] = true;
        }
      } else {
        args.extra.push(arg);
      }
    }
  });

  return args;
};

export const parseDeepLink = (url) => {
  if (!url) {
    return {};
  }
  const link = new URL(url);
  const result = {
    origin: url,
    main: link.hostname,
    params: {},
  };
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of link.searchParams.entries()) {
    result.params[key] = value;
  }

  return result;
};
