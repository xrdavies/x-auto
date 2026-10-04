export const booleanFlags = new Set(['--json', '--headed', '--dry-run']);
export const valueFlags = new Set(['--profile', '--profile-path', '--handle', '--text', '--file', '--tweet', '--socket', '--host', '--source', '--version']);

const isKnownFlag = (arg: string) => booleanFlags.has(arg) || valueFlags.has(arg);

export const parseArgs = (argv: string[]) => {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (booleanFlags.has(arg)) {
      flags.add(arg);
      continue;
    }
    if (valueFlags.has(arg)) {
      const next = argv[index + 1];
      if (next === undefined || isKnownFlag(next)) errors.push(`${arg} 需要一个值`);
      else if (values.has(arg)) errors.push(`参数重复：${arg}`);
      else values.set(arg, next);
      if (next !== undefined && !isKnownFlag(next)) index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      errors.push(`未知参数：${arg}`);
      continue;
    }
    positional.push(arg);
  }
  return {
    positional,
    errors,
    value: (name: string) => values.get(name),
    has: (name: string) => flags.has(name),
  };
};
