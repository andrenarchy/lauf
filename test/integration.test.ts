import test from 'ava'
import pg from 'pg'

import { runMigrations, RunMigrationsOptions, Migration } from '../src/index.js'

const TABLE = 'test_migrations'

async function createPgClient() {
	const pgClient = new pg.Client({ connectionString: process.env.POSTGRESQL_URL })
	await pgClient.connect()
	return pgClient
}

async function resetDatabase() {
	const pgClient = await createPgClient()
	await pgClient.query(`
		DROP SCHEMA public CASCADE;
		CREATE SCHEMA public;
	`);
	await pgClient.end()
}

test.beforeEach(resetDatabase)

test('Empty migrations set up table', async t => {
	const result = await runMigrations({
		setup: async () => ({ pgClient: await createPgClient() }),
		teardown: ({ pgClient }) => pgClient.end(),
		migrations: [],
		table: TABLE,
		logger: () => undefined,
	})
	t.deepEqual(result, [])
	const pgClient = await createPgClient()
	const rawMigrations = await pgClient.query(`SELECT * from ${TABLE}`)
	t.deepEqual(rawMigrations.rows, [])
	await pgClient.end()
})

interface TestOptions {
	pgClient: pg.Client,
	otherPersistence: Record<string, string>
}

const migrations: Migration<TestOptions>[] = [
	{
		id: '2022-07-09-create-users',
		description: 'Create users',
		up: ({ pgClient }) => pgClient.query(`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`),
		down: ({ pgClient }) => pgClient.query(`DROP TABLE users;`),
	},
	{
		id: '2022-07-10-add-users-display-name',
		description: 'Add display name to users',
		up: ({ pgClient }) => pgClient.query(`ALTER TABLE users ADD COLUMN display_name TEXT;`),
		down: ({ pgClient }) => pgClient.query(`ALTER TABLE users DROP COLUMN display_name;`),
	},
]

const options: RunMigrationsOptions<TestOptions> = {
	setup: async () => ({ pgClient: await createPgClient(), otherPersistence: {} }),
	teardown: ({ pgClient }) => pgClient.end(),
	migrations: migrations,
	table: TABLE,
	logger: () => undefined,
}

test('Latest runs all migrations', async t => {
	const result = await runMigrations(options)
	t.deepEqual(result, migrations)
	const pgClient = await createPgClient()
	const rawMigrations = await pgClient.query(`SELECT * from ${TABLE} ORDER BY sort`)
	t.deepEqual(rawMigrations.rows.map(v => v.id), migrations.map(v => v.id))
	await pgClient.query(`INSERT INTO users (name, display_name) VALUES ('andre', 'André Gaul');`)
	await pgClient.end()
})

test('Latest and down runs all but one migrations', async t => {
	await runMigrations(options)
	const pgClient = await createPgClient()
	await pgClient.query(`INSERT INTO users (name, display_name) VALUES ('andre', 'André Gaul');`)
	const result = await runMigrations({
		...options,
		mode: 'down',
	})
	t.deepEqual(result, [migrations[1]])
	const rawMigrations = await pgClient.query(`SELECT * from ${TABLE} ORDER BY sort`)
	t.deepEqual(rawMigrations.rows.map(v => v.id), migrations.slice(0, 1).map(v => v.id))
	const rawUsers = await pgClient.query(`SELECT * from users`)
	t.deepEqual(rawUsers.rows, [{ id: 1, name: 'andre' }])
	await pgClient.end()
})
