import { Client } from "pg";

import { getLocalPostgresConfig } from "./local-postgres-config.mjs";

const { databaseName, roleName } = getLocalPostgresConfig();
const password = roleName;
const admin = new Client({ database: "postgres" });

await admin.connect();

try {
	const role = await admin.query("select 1 from pg_roles where rolname = $1", [roleName]);

	if (role.rowCount === 0) {
		await admin.query(`create role ${roleName} login password '${password}'`);
	}

	const database = await admin.query("select 1 from pg_database where datname = $1", [
		databaseName,
	]);

	if (database.rowCount === 0) {
		await admin.query(`create database ${databaseName} owner ${roleName}`);
	}
} finally {
	await admin.end();
}

console.log(`Local Postgres database ${databaseName} is ready.`);
