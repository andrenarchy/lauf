# 🏃‍♀️ lauf
[![CI](https://github.com/andrenarchy/lauf/actions/workflows/ci.yaml/badge.svg)](https://github.com/andrenarchy/lauf/actions/workflows/ci.yaml) ![npm](https://img.shields.io/npm/v/lauf)

*lauf* is a lightweight migration runner for Typescript.

🐘 Uses PostgreSQL for keeping track of migrations.<br/>
🔗 Guaranteed consistency for your PostgreSQL data via transactions.<br/>
☁️ Handle arbitrary further databases or file storages in your migrations (e.g., S3 or GCS).<br/>
👩‍💻 Migration order is defined in code, not implicitly through files in a directory.<br/>
📦 Use any packages you want in your migrations.<br/>
🪶 Lightweight: only a single dependency (`pg`).

## Documentation

### Example

Migrations can be run like
```typescript
import { runMigrations } from 'lauf'
import pg from 'pg'

await runMigrations({
  setup: async () => {
    const pgClient = new pg.Client({ connectionString: process.env.POSTGRESQL_URL })
    await pgClient.connect()
    return { pgClient }
  },
  teardown: ({ pgClient }) => pgClient.end(),
  migrations: [
    {
      id: '2022-07-09-create-users',
      description: 'Create users',
      up: ({ pgClient }) => pgClient.query(
        `CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`
      ),
      down: ({ pgClient }) => pgClient.query(`DROP TABLE users;`),
    },
    // add further migrations
  ],
  logger: (msg) => console.log(msg)
})
```

### Splitting in multiple files

For organizing migrations, each migration can also be kept in a separate file like

```typescript
import { Migration } from 'lauf'

const migration: Migration = {
  id: '2022-07-09-create-users',
  description: 'Create users',
  up: ({ pgClient }) => pgClient.query(
    `CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`
  ),
  down: ({ pgClient }) => pgClient.query(`DROP TABLE users;`),
}

export default migration
```

Then the files can be run as follows:
```typescript
await runMigrations({
  // see above
  migrations: [
    import('./2022-07-10-create-users-table.js'),
    // add further migrations here
  ].map(v => v.default),
})
```

### Migrate down/up

Setting the `mode` option to `up` or `down` you can migrate step-wise up or down. The default value is `latest` which runs all migrations.

### Further databases or storages

The `setup` function can return arbitrary further properties. All returned properties will be passed to the migrations and the `teardown` function. For example:

```typescript
await runMigrations({
  setup: async () => {
    const pgClient = new pg.Client({ connectionString: process.env.POSTGRESQL_URL })
    await pgClient.connect()
    const gcs = new Storage(process.env.GCS_CREDENTIALS)
    return { pgClient, gcs }
  },
  teardown: ({ pgClient, gcs }) => pgClient.end(),
  migrations: [
    {
      id: '2022-07-09-create-users',
      description: 'Create users',
      up: async ({ pgClient, gcs }) => {
        await pgClient.query(
        `CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`
        )
        await gcs.upload(...)
      },
      down: ({ pgClient, gcs }) => pgClient.query(`DROP TABLE users;`),
    },
    // add further migrations
  ],
})
```

## Tests

```bash
docker run -d --name pg-lauf -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:14
export POSTGRESQL_URL=postgres://postgres:test@127.0.0.1:5432/postgres?sslmode=disable
npm run build && npm test
```
