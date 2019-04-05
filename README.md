# MongoDB Backup Util

## Usage
```
Usage: mbu [OPTIONS...] [ARGS...]
mbu (mongodb-backup-util) is a utility that enables easy backup and restoration
of any MongoDB database.

Examples: 

  mbu -la                                  # Lists all available backups
  mbu -b                                   # Creates a new backup
  mbu -b --db="fooBar" --path="~/backups"  # Creates a new backup of db "fooBar"
                                           # in the directory "~/backups".
  mbu -b --filter="{ qty: { $gt: 4 }"      # Selects only the documents where
                                           # the field 'qty' is greater than 4.
  mbu -r ~/backups/fooBar-190401-091200    # Restores the db from the specified
                                           # backup.
  mbu -s "0 3 * * *"                       # Schedule a backup for 3am every day

Operations:

  -h, --help                  Prints this help text.
  -b, --backup                Creates a new backup.
  -r, --restore               Restores a database from a specified backup.
  -l, --list                  Lists the last 5 backups.
  -s, --schedule[=CRON-EXP]   Performs a backup on an interval specified by a
                              cron expression. If a cron expression is provided,
                              it overrides the config.
      --config-path           Prints the path to the config.
      --auth-path             Prints the path to the auth file.

Backup options:

      --filter=QUERY-OBJ      Selects only the documents that are matched by the
                              query object.
      --db=DB-NAME            Selects the specified db. Overrides config. 
      --path=PATH             The directory in which backups will be created.
                              Overrides config.

Restore options:

      --path=PATH             The backup directory that will be used to restore
                              the selected db. Overrides config.
      --db=DB-NAME            Selects the specified db. Overrides config.

Schedule options:

      --name=NAME             Sets the name of the schedule job.

List options:

  -a, --all                   List all available backups.
      --limit=INT             Set the max number of backups to display.
      --path=PATH             The directory that will be scanned for available
                              backups. Overrides config.

```

## Config

`out/config.json`:
```json
{
  "dbName": "fooBarDB",
  "path": "~/backups",
  "schedule": "0 3 * * *",
  "timezone": "Europe/Oslo",
  "lsLimit": 5,
  "backupLimit": 100
}
```

* `dbName`: The name of the db to backup / restore.
* `path`: The directory in which backups will be created.
* `schedule`: A cron expression determining the interval of the schedule operation.
* `timezone`: An IANA timezone name. Used to adjust the UTC offset on schedule invocation times such that the jobs will always fire on the specified time, in the specified timezone, regardless of the timezone settings of the host machine.
* `lsLimit`: The number of backups to display during list.
* `backupLimit`: The max number of backups to keep in the backup folder. After reaching the limit, the oldest backups will be deleted upon creating new ones. Set the value to `-1` to disable the limit.

`out/auth.json`:
```json
{
  "DB_SRV": "mongodb+srv://%s:%s@<cluster-name>.mongodb.net/test?retryWrites=true",
  "DB_U": "<username>",
  "DB_P": "<password>"
}
```

* `DB_SRV`: The connection string to your cluster with both username and password replaced with `%s`.
* `DB_U`: Username.
* `DB_P`: Password. It will be URI encoded automatically. 
