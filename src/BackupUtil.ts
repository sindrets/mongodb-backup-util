import * as BSON from "bson";
import config from "config.json";
import { DbRemote } from "DbRemote";
import fs from "fs";
import { Globals } from "Globals";
import { Logger } from "Logger";
import { MongoError } from "mongodb";
import schedule from "node-schedule";
import path from "path";
import moment = require("moment");
import { EventHandler } from "EventHandler";
import { GlobalEvent } from "Constants";
import os from "os";

export class BackupUtil {

	private TARGET_DIR: string = "";

	private dbRemote: DbRemote;

	constructor() {

		EventHandler.on(GlobalEvent.EXIT, () => { this.exit() }, true);
		process.on("SIGINT", () => { this.exit() });
		process.on("SIGABRT", () => { this.exit() });

		this.dbRemote = new DbRemote(Globals.flags.get("db"));

		if (Globals.args[0] == "backup") this.backup();
		else if (Globals.args[0] == "restore") this.restore();
		else if (Globals.args[0] == "ls") this.printBackups();

	}

	public static PrintNextInvocations(): void {

		for (let job in schedule.scheduledJobs) {
			Logger.info(`Job <${job}> next invocation: ` + schedule.scheduledJobs[job].nextInvocation());
		}

	}

	private backup(query?: { [key: string]: any; } | { [x: string]: any; }) {

		this.TARGET_DIR = Globals.flags.get("path") || config.path;
		if (this.TARGET_DIR.length == 0) {
			Logger.error("Backup path was not provided nor defined in config.json!");
			return;
		}
		
		// resolve ~
		this.TARGET_DIR = path.resolve(this.TARGET_DIR.replace(/^~(?=$|\/)/g, os.homedir()));

		this.dbRemote.connect().then(db => {
			this.dbRemote.getAllCollections().then(collections => {

				let now = moment();

				if (!fs.existsSync(this.TARGET_DIR)) {
					fs.mkdirSync(this.TARGET_DIR);
					Logger.info("Backup root folder created at: " + this.TARGET_DIR);
				}

				let bakName: string = `${db.databaseName}-${now.format("YYMMDD-HHmmss")}`;
				let bakPath: string = path.join(this.TARGET_DIR, bakName);
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

	public restore() {

		this.TARGET_DIR = Globals.flags.get("path") || Globals.args[1] || "";

		if (Globals.args[1] == "ls") {
			this.printBackups();
			return;
		}
		if (this.TARGET_DIR.length == 0) {
			Logger.error("Restore path was not provided!");
			return;
		}
		else if (!fs.existsSync(this.TARGET_DIR)) {
			Logger.error("The provided restore point does not exist!");
			return;
		}

		// resolve ~
		this.TARGET_DIR = path.resolve(this.TARGET_DIR.replace(/^~(?=$|\/)/g, os.homedir()));

		this.dbRemote.connect().then(db => {
			fs.readdirSync(this.TARGET_DIR).forEach((sCollection, index, c) => {

				let resolve = (success: boolean) => {
					if (!success) {
						Logger.error("Failed to drop collection: " + sCollection);
						this.exit();
						return;
					}
					else if (db) {
						let collection = db.collection(sCollection);
						let docBulk: object[] = [];

						let collectionPath = path.join(this.TARGET_DIR, sCollection);
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

	public printBackups(): void {

		this.TARGET_DIR = Globals.flags.get("path") || config.path;
		if (this.TARGET_DIR.length == 0) {
			Logger.warn("No path was provided and 'path' was unset in config.json!");
			Logger.warn("Please specify a path with --path=<path>, or define 'path' in config.json.");
			this.exit();
			return;
		}

		// resolve ~
		this.TARGET_DIR = path.resolve(this.TARGET_DIR.replace(/^~(?=$|\/)/g, os.homedir()));

		Logger.println("Available backups:");
		
		fs.readdirSync(this.TARGET_DIR || config.path).forEach(sCollection => {
			Logger.println(path.join(this.TARGET_DIR || config.path, sCollection));
		});

	}

	public async exit(): Promise<void> {

		Logger.println("Closing connections and exiting...");
		if (this.dbRemote) {
			await this.dbRemote.disconnect();
		}
		process.exit(0);

	}

}