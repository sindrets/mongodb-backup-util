import auth from "auth.json";
import config from "config.json";
import { GlobalEvent } from "Constants";
import { EventHandler } from "EventHandler";
import { Logger } from "Logger";
import { Collection, Db, MongoClient } from "mongodb";
import assert = require("assert");
import { sprintf } from "sprintf-js";

export class DbRemote {

    private uri: string;
    private dbName: string;
    private connected: boolean = false;
    private dbClient: MongoClient | undefined;
    private db: Db | undefined;

    constructor(dbName?: string) {
        this.uri = sprintf(auth.DB_SRV, auth.DB_U, encodeURI(auth.DB_P));
        this.dbName = dbName != undefined ? dbName : config.dbName;
    }

    public async connect(user?: string, pass?: string): Promise<Db> {

        return new Promise((resolve, reject) => {

            if (user != undefined && pass != undefined) {
                this.uri = sprintf(auth.DB_SRV, user, pass);
            }

            if (this.dbName.length == 0) {
                Logger.error("No db name was provided and 'dbName' was unset in config.json!");
                Logger.println("Please specify a db with --db='<db-name>', or define 'dbName' in config.json.");
                EventHandler.trigger(GlobalEvent.EXIT, true);
                reject();
                return;
            }

            if (this.uri.length == 0) {
                Logger.error("No db srv uri was provided in auth.json!");
                Logger.println("Please define 'DB_SRV' in auth.json.");
                EventHandler.trigger(GlobalEvent.EXIT, true);
                reject();
                return;
            }

            MongoClient.connect(this.uri, {useNewUrlParser: true}, (err, dbClient) => {

                assert.strictEqual(err, null);
                if (err) {
                    Logger.error("Failed to connect to the database!", err);
                    reject(err);
                }
                Logger.success("Successfully connected to the database!");
    
                this.dbClient = dbClient;
                this.db = dbClient.db(this.dbName);
                this.connected = true;
                EventHandler.trigger(GlobalEvent.CONNECTED, true);
                
                resolve(this.db);

            });

        })

    }
    
    /**
	 * Close the connection to the database.
	 */
	public async disconnect(): Promise<void> {

        return new Promise<void>((resolve, reject) => {
            if (!this.connected) return resolve();
            if (this.dbClient) {
                this.dbClient.close().then(
                    () => {
                        this.connected = false;
                        Logger.success("Closed connection to the database!");
                        return resolve();
                    }, reject );
            }
            else resolve();
        })

    }

    public isConnected(): boolean {
        return this.connected;
    }
    
    public getDb(): Db | undefined {
        return this.db;
    }

    public async getAllCollections(): Promise<Collection<any>[]> {

        return new Promise<Collection<any>[]>((resolve, reject) => {
            if (this.db) {
                this.db.collections().then( resolve, reject );
            }
            else {
                reject(new Error("The database was undefined!"));
            }
        });
        
    }
    
}