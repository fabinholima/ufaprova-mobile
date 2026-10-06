const { DatabaseSync } = require('node:sqlite');
module.exports = function open(filename=':memory:') {
  const raw = new DatabaseSync(filename);
  const db = {
    raw,
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, ...params) { return raw.prepare(sql).run(...params); },
    async getFirstAsync(sql, ...params) { return raw.prepare(sql).get(...params) || null; },
    async getAllAsync(sql, ...params) { return raw.prepare(sql).all(...params); },
    async withExclusiveTransactionAsync(task) { raw.exec('BEGIN IMMEDIATE'); try { await task(db); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
    close() { raw.close(); },
  };
  return db;
};
