// set custom import paths
process.env.NODE_PATH = __dirname;
require("module").Module._initPaths();

import fs from "fs";
import path from "path";

if (!fs.existsSync(path.join(__dirname, "auth.json"))) {
    fs.copyFileSync(path.join(__dirname, "auth-TEMPLATE.json"), path.join(__dirname, "auth.json"));
}

import { BackupUtil } from "BackupUtil";
import { FlagParser } from "FlagParser";
import { Globals } from "Globals";
import { Logger } from "Logger";
import { TestRunner } from "tests/testRunner";

Globals.args = process.argv.slice(2);
Globals.flags = FlagParser.parse(Globals.args, false);

if (Globals.flags.isTrue("debug")) {
    Globals.DEBUG_MODE = true;
    Logger.debugln("Running in debug mode!");
    Logger.debug("args: "); Logger.debugln(Globals.args);
    Logger.debug("flags: "); Logger.debugln(Globals.flags);
}

if (Globals.flags.isTrue("test")) {
    new TestRunner();
}
else {
    new BackupUtil();
}