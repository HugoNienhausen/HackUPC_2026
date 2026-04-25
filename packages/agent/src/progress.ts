import ora, { type Ora } from 'ora';

export interface Progress {
  start(message: string): void;
  succeed(message: string): void;
  fail(message: string): void;
  info(message: string): void;
}

export const NOOP_PROGRESS: Progress = {
  start() {},
  succeed() {},
  fail() {},
  info() {},
};

export function createOraProgress(): Progress {
  let spinner: Ora | null = null;
  let phaseStart = 0;
  return {
    start(message) {
      if (spinner && spinner.isSpinning) spinner.stop();
      phaseStart = Date.now();
      spinner = ora({ text: message, stream: process.stderr }).start();
    },
    succeed(message) {
      const ms = Date.now() - phaseStart;
      const stamp = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
      const text = message.includes('{t}')
        ? message.replace('{t}', stamp)
        : `${message} (${stamp})`;
      if (spinner) {
        spinner.succeed(text);
        spinner = null;
      } else {
        process.stderr.write(`✓ ${text}\n`);
      }
    },
    fail(message) {
      if (spinner) {
        spinner.fail(message);
        spinner = null;
      } else {
        process.stderr.write(`✗ ${message}\n`);
      }
    },
    info(message) {
      if (spinner && spinner.isSpinning) spinner.stop();
      spinner = null;
      process.stderr.write(`${message}\n`);
    },
  };
}

export function pickProgress(opts: { airplane: boolean; tty: boolean }): Progress {
  if (opts.airplane) return NOOP_PROGRESS;
  if (!opts.tty) return NOOP_PROGRESS;
  return createOraProgress();
}
