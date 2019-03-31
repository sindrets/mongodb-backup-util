import * as BSON from "bson";
import config from "config.json";
import { GlobalEvent } from "Constants";
import { DbRemote } from "DbRemote";
import { EventHandler } from "EventHandler";
import fs from "fs";
import { Globals } from "Globals";
import { Logger } from "Logger";
import { Utils } from "misc/Utils";
import { MongoError } from "mongodb";
import schedule from "node-schedule";
import os from "os";
import path from "path";
import readline from "readline";
import moment = require("moment");
import auth from "auth.json";
import passPrompt from "password-prompt";

export class BackupUtil {

	private readonly BAK_NAME_PATTERN = /^.*-[0-9]{6}-[0-9]{6}$/g;

	private dbRemote: DbRemote;
	private rl?: readline.Interface;

	constructor() {

		EventHandler.on(GlobalEvent.EXIT, () => { this.exit() }, true);
		process.on("SIGINT", () => { this.exit() });
		process.on("SIGABRT", () => { this.exit() });

		this.dbRemote = new DbRemote(Globals.flags.get("db"));

		switch (Globals.args[0]) {
			case "backup": case "b": this.backup(); break;
			case "restore": case "r": this.restore(); break;
			case "ls": this.printBackups(Globals.args[1]); break;
		}

	}

	public static PrintNextInvocations(): void {

		for (let job in schedule.scheduledJobs) {
			Logger.info(`Job <${job}> next invocation: ` + schedule.scheduledJobs[job].nextInvocation());
		}

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

	private backup(query?: { [key: string]: any; } | { [x: string]: any; }) {

		let targetDir = Globals.flags.get("path") || config.path;
		if (targetDir.length == 0) {
			Logger.error("Backup path was not provided nor defined in config.json!");
			return;
		}

		targetDir = this.resolvePath(targetDir);

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

	public restore(force = false) {

		let targetDir = Globals.flags.get("path") || Globals.args[1] || "";

		if (Globals.args[1] == "ls") {
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

		Logger.println(`Enter password for user '${auth.DB_U}':`);
		passPrompt("Password: ", { method: "hide" }).then(response => {

			if (response !== auth.DB_P) {
				Logger.error("Authentication failure.");
				this.exit();
				return;
			}
			else {

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
			
		})

	}

	public printBackups(dir?: string): void {

		let targetDir = Globals.flags.get("path") || dir || config.path || "";
		if (targetDir.length == 0) {
			Logger.warn("No path was provided and 'path' was unset in config.json!");
			Logger.warn("Please specify a path with --path=<path>, or define 'path' in config.json.");
			return;
		}

		targetDir = this.resolvePath(targetDir);
		if (!fs.existsSync(targetDir)) {
			Logger.error("The target directory does not exist: " + targetDir);
			return;
		}

		let all = Globals.flags.isTrue(["all", "a"]);
		if (all) Logger.println("Available backups:");
		else Logger.println(`Available backups (last ${config.lsLimit}):`);

		let files = fs.readdirSync(targetDir || config.path);

		// sort files by name, descending
		files = files.sort((a, b) => {
			if (a < b) return 1;
			if (a > b) return -1;
			return 0;
		})
		
		// remove elements that don't follow naming conventions
		let offset = 0;
		files.slice(0).forEach((s, i, a) => {
			if (s.match(this.BAK_NAME_PATTERN) == null) {
				files.splice(i - offset++, 1);
			}
		})

		if (files.length == 0) {
			Logger.println("No backups found.");
			return;
		}

		let limit = config.lsLimit;

		if (all) limit = files.length;

		files.forEach((bakName, i) => {
			if (i <= limit-1) {
				Logger.println(path.join(targetDir, bakName));
			}
		});

	}

	public async exit(): Promise<void> {

		if (this.dbRemote) {
			await this.dbRemote.disconnect();
		}
		process.exit(0);

	}

}