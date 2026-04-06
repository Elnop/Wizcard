import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
	if (!sqlPromise) {
		sqlPromise = initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
	}
	return sqlPromise;
}

export async function openDatabase(buffer: ArrayBuffer): Promise<Database> {
	const SQL = await getSql();
	return new SQL.Database(new Uint8Array(buffer));
}
