/**
 * Install command for `npx claude-mem install`.
 *
 * Claude Code only. Registers the marketplace and triggers the plugin
 * install via the `claude` CLI.
 *
 * Pure Node.js — no Bun APIs used.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const isInteractive = process.stdin.isTTY === true;

const log = {
  info: (msg: string) => isInteractive ? p.log.info(msg) : console.log(`  ${msg}`),
  success: (msg: string) => isInteractive ? p.log.success(msg) : console.log(`  ${msg}`),
  warn: (msg: string) => isInteractive ? p.log.warn(msg) : console.warn(`  ${msg}`),
  error: (msg: string) => isInteractive ? p.log.error(msg) : console.error(`  ${msg}`),
};

import {
  marketplaceDirectory,
  readPluginVersion,
} from '../utils/paths.js';

export interface InstallOptions {}

export async function runInstallCommand(_options: InstallOptions = {}): Promise<void> {
  const version = readPluginVersion();

  if (isInteractive) {
    p.intro(pc.bgCyan(pc.black(' claude-mem install ')));
  } else {
    console.log('claude-mem install');
  }
  log.info(`Version: ${pc.cyan(version)}`);
  log.info(`Platform: ${process.platform} (${process.arch})`);

  const marketplaceDir = marketplaceDirectory();
  const alreadyInstalled = existsSync(join(marketplaceDir, 'plugin', '.claude-plugin', 'plugin.json'));

  if (alreadyInstalled) {
    try {
      const existingPluginJson = JSON.parse(
        readFileSync(join(marketplaceDir, 'plugin', '.claude-plugin', 'plugin.json'), 'utf-8'),
      );
      log.warn(`Existing installation detected (v${existingPluginJson.version ?? 'unknown'}).`);
    } catch (error: unknown) {
      console.warn('[install] Failed to read existing plugin version:', error instanceof Error ? error.message : String(error));
      log.warn('Existing installation detected.');
    }

    if (isInteractive) {
      const shouldContinue = await p.confirm({
        message: 'Reinstall?',
        initialValue: true,
      });

      if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.cancel('Installation cancelled.');
        process.exit(0);
      }
    }
  }

  let installFailed = false;
  try {
    execSync(
      'claude plugin marketplace add thedotmack/claude-mem && claude plugin install claude-mem',
      { stdio: 'inherit' },
    );
    log.success('Claude Code: plugin installed via CLI.');
  } catch (error: unknown) {
    console.error('[install] Claude Code plugin install error:', error instanceof Error ? error.message : String(error));
    log.error('Claude Code: plugin install failed. Is `claude` CLI on your PATH?');
    installFailed = true;
  }

  const summaryLines = [
    `Version:     ${pc.cyan(version)}`,
    `Plugin dir:  ${pc.cyan(marketplaceDir)}`,
  ];

  if (isInteractive) {
    p.note(summaryLines.join('\n'), installFailed ? 'Installation Failed' : 'Installation Complete');
  } else {
    console.log(`\n  ${installFailed ? 'Installation Failed' : 'Installation Complete'}`);
    summaryLines.forEach(l => console.log(`  ${l}`));
  }

  const workerPort = process.env.CLAUDE_MEM_WORKER_PORT || '37777';
  const nextSteps = [
    'Open Claude Code and start a conversation -- memory is automatic!',
    `View your memories: ${pc.underline(`http://localhost:${workerPort}`)}`,
    `Search past work: use ${pc.bold('/mem-search')} in Claude Code`,
    `Start worker: ${pc.bold('npx claude-mem start')}`,
  ];

  if (isInteractive) {
    p.note(nextSteps.join('\n'), 'Next Steps');
    p.outro(installFailed ? pc.yellow('claude-mem install reported failures.') : pc.green('claude-mem installed successfully!'));
  } else {
    console.log('\n  Next Steps');
    nextSteps.forEach(l => console.log(`  ${l}`));
    if (installFailed) {
      process.exitCode = 1;
    }
  }
}
