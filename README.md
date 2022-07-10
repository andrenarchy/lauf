# lauf

*lauf* is a lightweight migration runner for Typescript where each migration is an ESM module.

## Tests

```
export POSTGRESQL_URL=postgres://postgres:test@127.0.0.1:15432/postgres?sslmode=disable
npm run build && npm test
```
