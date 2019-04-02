import auth from "auth.json";
import * as BSON from "bson";
import config from "config.json";
import { GlobalEvent } from "Constants";
import { DbRemote } from "DbRemote";
import { EventHandler } from "EventHandler";
import fs from "fs";
import { Globals } from "Globals";
import { Logger } from "Logger";
import { printNextInvocations, scheduleJobUtc } from "misc/ScheduleJobUtc";
import { Utils } from "misc/Utils";
import { MongoError } from "mongodb";
import os from "os";
import passPrompt from "password-prompt";
import path from "path";
import readline from "readline";
import rimraf from "rimraf";
import { sprintf } from "sprintf-js";
import moment = require("moment-timezone");

export class BackupUtil {

	private readonly BAK_NAME_PATTERN = /^.*-[0-9]{6}-[0-9]{6}$/g;

	private dbRemote: DbRemote;
	private rl?: readline.Interface;

	constructor() {

		EventHandler.on(GlobalEvent.EXIT, () => { this.exit() }, true);
		process.on("SIGINT", () => { this.exit() });
		process.on("SIGABRT", () => { this.exit() });

		this.dbRemote = new DbRemote(Globals.flags.get("db"));

		if (Globals.flags.size == 0) {
			this.printHelp();
			return;
		}

		if (Globals.flags.isTrue(["help", "h"])) this.printHelp();
		if (Globals.flags.isTrue(["backup", "b"])) this.backup();
		if (Globals.flags.isTrue(["restore", "r"])) this.restore();
		if (Globals.flags.isTrue(["list", "l"])) this.printBackups(Globals.args[0]);
		if (Globals.flags.isTrue(["schedule", "s"])) this.schedule();

	}

	private resolvePath(s: string): string {
		return path.resolve(s.replace(/^~(?=$|\/)/g, os.homedir()));
	}

	private rlOpen(): readline.Interface {
		return this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
	}

	private rlClose(): void {
		if (this.rl) this.rl.close();
	}

	public async backup(query?: { [key: string]: any; } | { [x: string]: any; }) {

		let targetDir = Globals.flags.get("path") || config.path;
		if (targetDir.length == 0) {
			Logger.error("Backup path was not provided nor defined in config.json!");
			return;
		}

		targetDir = this.resolvePath(targetDir);

		let backups = this.scanBackups(targetDir, true) || [];
		let i = backups.length - 1;
		while (backups.length >= config.backupLimit) {
			Logger.info("Removing: " + path.join(targetDir, backups[i]));
			rimraf.sync(path.join(targetDir, backups[i]));
			backups.splice(i--, 1);
		}

		this.dbRemote.connect().then(db => {
			this.dbRemote.getAllCollections().then(collections => {

				let now = moment();

				if (!fs.existsSync(targetDir)) {
					fs.mkdirSync(targetDir);
					Logger.info("Backup root folder created at: " + targetDir);
				}

				let bakName: string = `${db.databaseName}-${now.format("YYMMDD-HHmmss")}`;
				let bakPath: string = path.join(targetDir, bakName);
				if (fs.existsSync(bakPath)) {
					Logger.error("A backup by that name alreay exists: " + bakPath);
					this.exit();
					return;
				}
				else {
					fs.mkdirSync(bakPath);
					Logger.info("Created new backup folder at: " + bakPath);
				}

				collections.forEach((collection, index, c) => {

					let collectionPath = path.join(bakPath, collection.collectionName);
					fs.mkdirSync(collectionPath);

					let stream = collection.find(query).stream();

					stream.on("data", doc => {

						let docPath = path.join(collectionPath, String(doc._id) + ".bson");
						fs.writeFileSync(docPath, BSON.serialize(doc));
						Logger.info("Wrote serialized doc to: " + docPath);

					})

					stream.on("end", () => {

						if (index == c.length - 1) {
							Logger.success("Backup created succsessfully!");
							this.exit();
						}

					})

				})
			})
		})

	}

	public async restore(force = false) {

		let targetDir = Globals.flags.get("path") || Globals.args[0] || "";

		if (Globals.args[0] == "ls") {
			this.printBackups();
			return;
		}
		if (targetDir.length == 0) {
			Logger.error("Restore path was not provided!");
			return;
		}
		else if (!fs.existsSync(targetDir)) {
			Logger.error("The provided restore point does not exist!");
			return;
		}

		targetDir = this.resolvePath(targetDir);

		if (!force && path.basename(targetDir).match(this.BAK_NAME_PATTERN) == null) {
			Logger.warn("The target dir does not follow the standard name pattern for an mbu backup: " + targetDir);
			this.rlOpen().question("Are you sure you want to proceed? y/N: ", result => {
				this.rlClose();
				if (Utils.isYes(result, false)) this.restore(true);
			});
			return;
		}

		let response: string = "";
		Logger.println(`Enter password for user '${auth.DB_U}':`);
		await passPrompt("Password: ", { method: "hide" }).then(resp => response = resp);

		if (response !== auth.DB_P) {
			Logger.error("Authentication failure.");
			return;
		}

		this.dbRemote.connect().then(db => {
			fs.readdirSync(targetDir).forEach((sCollection, index, c) => {

				let resolve = (success: boolean) => {
					if (!success) {
						Logger.error("Failed to drop collection: " + sCollection);
						this.exit();
						return;
					}
					else if (db) {
						let collection = db.collection(sCollection);
						let docBulk: object[] = [];

						let collectionPath = path.join(targetDir, sCollection);
						fs.readdirSync(collectionPath).forEach(sDoc => {

							let doc: any;
							let docPath = path.join(collectionPath, sDoc);
							Logger.debugln("Deserializing doc from: " + docPath);

							try {
								doc = BSON.deserialize(fs.readFileSync(docPath));
							}
							catch (err) {
								Logger.error("Failed to deserialize backup document: " + docPath, err);
								this.exit();
								return;
							}

							if (doc) docBulk.push({
								insertOne: {
									document: doc
								}
							});

						})

						let callback = (err: MongoError, result: any) => {
							if (err) Logger.error(err);
							if (result) Logger.info(`Restored collection '${sCollection}' from backup!`);
							if (index == c.length - 1) {
								Logger.success("Backup restore completed!");
								this.exit();
							}
						}

						if (docBulk.length > 0) {
							collection.bulkWrite(docBulk, callback);
						}
						else {
							db.createCollection(sCollection, callback);
						}
					}
				}

				db.dropCollection(sCollection).then(resolve, () => { resolve(true) });

			})
		})

	}

	public printBackups(dir?: string): void {

		let targetDir = Globals.flags.get("path") || dir || config.path || "";
		if (targetDir.length == 0) {
			Logger.warn("No path was provided and 'path' was unset in config.json!");
			Logger.warn("Please specify a path with --path=PATH, or define 'path' in config.json.");
			return;
		}

		targetDir = this.resolvePath(targetDir);
		if (!fs.existsSync(targetDir)) {
			Logger.error("The target directory does not exist: " + targetDir);
			return;
		}

		let all = Globals.flags.isTrue(["all", "a"]);
		let limit = Number(Globals.flags.get("limit") || config.lsLimit);

		if (all) Logger.println("Available backups:");
		else Logger.println(`Available backups (last ${limit}):`);

		let files = this.scanBackups(targetDir || config.path, true) || [];

		if (all) limit = files.length;

		files.forEach((bakName, i) => {
			if (i <= limit - 1) {
				Logger.println(path.join(targetDir, bakName));
			}
		});

	}

	public schedule(): void {

		let name = Globals.flags.get("name") || "MongoDB Backup";
		let cronExp = Globals.args[0] || config.schedule || "";

		scheduleJobUtc(name, cronExp, config.timezone || moment.tz.guess(), () => {
			this.backup();
			printNextInvocations();
		});

		printNextInvocations();

	}

	public printHelp(): void {

		let help = fs.readFileSync(path.resolve(__dirname, "../help.txt"));
		Logger.println(sprintf(help.toString(), {
			configPath: path.resolve(__dirname, "config.json"),
			authPath: path.resolve(__dirname, "auth.json")
		}));

	}

	public scanBackups(targetDir: string, sort = false): string[] | null {

		if (!fs.existsSync(targetDir)) {
			Logger.error("Scan Backups: The target directory does not exist: " + targetDir);
			return null;
		}

		let files = fs.readdirSync(targetDir);

		if (sort) {
			// sort files by name, descending
			files = files.sort((a, b) => {
				if (a < b) return 1;
				if (a > b) return -1;
				return 0;
			})
		}

		// remove elements that don't follow naming conventions
		let offset = 0;
		files.slice(0).forEach((s, i, a) => {
			if (s.match(this.BAK_NAME_PATTERN) == null) {
				files.splice(i - offset++, 1);
			}
		})

		return files;

	}

	public async exit(): Promise<void> {

		if (this.dbRemote) {
			await this.dbRemote.disconnect();
		}
		Logger.println("");
		process.exit(0);

	}

}