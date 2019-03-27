// set custom import paths
process.env.NODE_PATH = __dirname;
require("module").Module._initPaths();

import { FlagParser } from "FlagParser";
import { Globals } from "Globals";
import { BackupUtil } from "BackupUtil";
import { Logger } from "Logger";

Globals.args = process.argv.slice(2);
Globals.flags = FlagParser.parse(Globals.args, false);

if (Globals.flags.isTrue("debug")) {
    Globals.DEBUG_MODE = true;
    Logger.debugln("Running in debug mode!");
    Logger.debugln("args: " + Globals.args);
    Logger.debugln("flags: " + Globals.flags);
}

const backupUtil = new BackupUtil();