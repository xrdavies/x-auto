import { serializeError } from './errors.js';

export type OutputOptions = { json: boolean };

export const writeSuccess = (action: string, data: Record<string, unknown>, options: OutputOptions) => {
  const payload = { success: true, action, ...data };
  process.stdout.write(`${options.json ? JSON.stringify(payload) : Object.entries(payload).map(([key, value]) => `${key}=${String(value)}`).join('\n')}\n`);
};

export const writeFailure = (action: string, error: unknown, options: OutputOptions) => {
  const payload = { success: false, action, error: serializeError(error) };
  process.stderr.write(`${options.json ? JSON.stringify(payload) : `[${payload.error.code}] ${payload.error.message}`}\n`);
  process.exitCode = 1;
};
