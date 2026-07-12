import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function replaceTableName(sql, tableName) {
  return sql.replace(/\`\$\{TABLE_NAME\}\`/g, `\`${tableName}\``);
}

function legacyIdentityHash(database) {
  const entities = [...database.entities].sort((a, b) => a.tableName.localeCompare(b.tableName));
  const entityDescriptions = entities.map(
    (entity) => replaceTableName(entity.createSql, entity.tableName),
  );
  const indexDescriptions = [];
  for (const entity of entities) {
    for (const index of entity.indices ?? []) {
      const prefix = index.unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
      let sql = replaceTableName(index.createSql, entity.tableName);
      const marker = 'IF NOT EXISTS';
      const markerIndex = sql.indexOf(marker);
      if (markerIndex >= 0) {
        sql = sql.substring(markerIndex + marker.length);
      }
      indexDescriptions.push(prefix + sql);
    }
  }
  const separator = '¯\\_(ツ)_/¯';
  return md5([...entityDescriptions, ...indexDescriptions].join(separator));
}

function schemaIdentityHash(database) {
  const entities = [...database.entities].sort((a, b) => a.tableName.localeCompare(b.tableName));
  let key = '';
  for (const entity of entities) {
    key += entity.tableName;
    key += entityIdentityHash(entity);
  }
  return md5(key);
}

function schemaIdentityHashFromCreateSql(database) {
  const entities = [...database.entities].sort((a, b) => a.tableName.localeCompare(b.tableName));
  let key = '';
  for (const entity of entities) {
    const sql = replaceTableName(entity.createSql, entity.tableName);
    key += entity.tableName;
    key += md5(sql);
  }
  return md5(key);
}

function entityIdentityHash(entity) {
  const tableName = entity.tableName;
  let hash = `CREATE TABLE \`${tableName}\`(`;
  hash += entity.fields
    .map((field) => `\`${field.columnName}\`${field.affinity}${field.notNull ? ' NOT NULL' : ''}`)
    .join(',');
  hash += ', PRIMARY KEY(';
  hash += entity.primaryKey.columnNames.map((name) => `\`${name}\``).join(',');
  hash += ')';
  if (entity.primaryKey.autoGenerate) {
    hash += ' AUTOINCREMENT';
  }
  hash += ')';
  for (const fk of entity.foreignKeys ?? []) {
    hash += ' FOREIGN KEY(';
    hash += fk.columns.map((name) => `\`${name}\``).join(',');
    hash += ') REFERENCES ';
    hash += `\`${fk.table}\`(`;
    hash += fk.referencedColumns.map((name) => `\`${name}\``).join(',');
    hash += `) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
  }
  for (const index of entity.indices ?? []) {
    hash += index.unique ? ' UNIQUE' : '';
    hash += ' INDEX ';
    hash += `\`${index.name}\`(`;
    hash += index.columnNames.map((name) => `\`${name}\``).join(',');
    hash += ')';
  }
  return md5(hash);
}

function loadSchema(version) {
  const file = path.join(
    root,
    'app/schemas/com.aus.ausgegeben.data.AusgegebenDatabase',
    `${version}.json`,
  );
  return JSON.parse(fs.readFileSync(file, 'utf8')).database;
}

const version = Number(process.argv[2] ?? 7);
const database = loadSchema(version);
const legacy = legacyIdentityHash(database);
const modern = schemaIdentityHash(database);
const fromCreateSql = schemaIdentityHashFromCreateSql(database);

console.log(`schema v${version}`);
console.log(`expected:  ${database.identityHash}`);
console.log(`legacy:    ${legacy}`);
console.log(`modern:    ${modern}`);
console.log(`createSql: ${fromCreateSql}`);

if (process.argv.includes('--write')) {
  const match = [legacy, modern].includes(database.identityHash)
    ? database.identityHash
    : modern;
  if (match === '00000000000000000000000000000000' || ![legacy, modern].includes(match)) {
    const chosen = modern;
    database.identityHash = chosen;
    database.setupQueries = [
      'CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)',
      `INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, '${chosen}')`,
    ];
    const file = path.join(
      root,
      'app/schemas/com.aus.ausgegeben.data.AusgegebenDatabase',
      `${version}.json`,
    );
    const output = { formatVersion: 1, database };
    fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`wrote ${chosen} to ${file}`);
  }
}
