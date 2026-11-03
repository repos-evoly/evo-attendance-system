/**
 * CLI entry point for report generation.
 */

import { runReportCLI } from './report.js';

runReportCLI(process.argv.slice(2));
