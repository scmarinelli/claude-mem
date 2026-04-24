/**
 * NPX CLI entry point for claude-mem.
 *
 * Usage:
 *   npx claude-mem                     → install for Claude Code
 *   npx claude-mem install             → install for Claude Code
 *   npx claude-mem update              → update to latest version
 *   npx claude-mem uninstall           → remove plugin
 *   npx claude-mem version             → print version
 *   npx claude-mem start               → start worker service
 *   npx claude-mem stop                → stop worker service
 *   npx claude-mem restart             → restart worker service
 *   npx claude-mem status              → show worker status
 *   npx claude-mem search <query>      → search observations
 *
 * This file is pure Node.js — Bun is NOT required for install commands.
 * Runtime commands (`start`, `stop`, etc.) delegate to Bun via the installed plugin.
 */
import pc from 'picocolors';
import { readPluginVersion } from './utils/paths.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase() ?? '';

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  const version = readPluginVersion();

  console.log(`
${pc.bold('claude-mem')} v${version} — persistent memory for AI coding assistants

${pc.bold('Install Commands')} (no Bun required):
  ${pc.cyan('npx claude-mem')}                     Install for Claude Code
  ${pc.cyan('npx claude-mem install')}              Install for Claude Code
  ${pc.cyan('npx claude-mem update')}               Update to latest version
  ${pc.cyan('npx claude-mem uninstall')}            Remove plugin
  ${pc.cyan('npx claude-mem version')}              Print version

${pc.bold('Runtime Commands')} (requires Bun, delegates to installed plugin):
  ${pc.cyan('npx claude-mem start')}                Start worker service
  ${pc.cyan('npx claude-mem stop')}                 Stop worker service
  ${pc.cyan('npx claude-mem restart')}              Restart worker service
  ${pc.cyan('npx claude-mem status')}               Show worker status
  ${pc.cyan('npx claude-mem search <query>')}       Search observations
  ${pc.cyan('npx claude-mem adopt [--dry-run] [--branch <name>]')}    Stamp merged worktrees into parent project
`);
}

// ---------------------------------------------------------------------------
// Command routing
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  switch (command) {
    // -- No command: default to install ------------------------------------
    case '': {
      const { runInstallCommand } = await import('./commands/install.js');
      await runInstallCommand();
      break;
    }

    // -- Install -----------------------------------------------------------
    case 'install': {
      const { runInstallCommand } = await import('./commands/install.js');
      await runInstallCommand();
      break;
    }

    // -- Update (alias for install — overwrite with latest) ----------------
    case 'update':
    case 'upgrade': {
      const { runInstallCommand } = await import('./commands/install.js');
      await runInstallCommand();
      break;
    }

    // -- Uninstall ---------------------------------------------------------
    case 'uninstall':
    case 'remove': {
      const { runUninstallCommand } = await import('./commands/uninstall.js');
      await runUninstallCommand();
      break;
    }

    // -- Version -----------------------------------------------------------
    case 'version':
    case '--version':
    case '-v': {
      console.log(readPluginVersion());
      break;
    }

    // -- Help --------------------------------------------------------------
    case 'help':
    case '--help':
    case '-h': {
      printHelp();
      break;
    }

    // -- Runtime: start / stop / restart / status --------------------------
    case 'start': {
      const { runStartCommand } = await import('./commands/runtime.js');
      runStartCommand();
      break;
    }
    case 'stop': {
      const { runStopCommand } = await import('./commands/runtime.js');
      runStopCommand();
      break;
    }
    case 'restart': {
      const { runRestartCommand } = await import('./commands/runtime.js');
      runRestartCommand();
      break;
    }
    case 'status': {
      const { runStatusCommand } = await import('./commands/runtime.js');
      runStatusCommand();
      break;
    }

    // -- Search ------------------------------------------------------------
    case 'search': {
      const { runSearchCommand } = await import('./commands/runtime.js');
      await runSearchCommand(args.slice(1));
      break;
    }

    // -- Adopt merged worktrees -------------------------------------------
    case 'adopt': {
      const { runAdoptCommand } = await import('./commands/runtime.js');
      runAdoptCommand(args.slice(1));
      break;
    }

    // -- Unknown -----------------------------------------------------------
    default: {
      console.error(pc.red(`Unknown command: ${command}`));
      console.error(`Run ${pc.bold('npx claude-mem --help')} for usage information.`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(pc.red('Fatal error:'), error.message || error);
  process.exit(1);
});
