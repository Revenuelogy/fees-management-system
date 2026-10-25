#!/usr/bin/env node
// Database CLI for any PostgreSQL 13+ server. Reads DATABASE_URL (from the environment, .env.local or .env).
//
//   node scripts/db.mjs migrate                 apply new files from db/migrations (in order, once each)
//   node scripts/db.mjs seed                    load db/seed.sql (demo data, local only)
//   node scripts/db.mjs reset [--force]         drop everything, migrate and seed (local databases only, unless --force)
//   node scripts/db.mjs test                    run the pgTAP tests in db/tests (needs the pgtap extension)
//   node scripts/db.mjs create-user --email <e> --password <p> [--name <n>] [--role admin|accountant|principal|caller|teacher]
//   node scripts/db.mjs set-password --email <e> --password <p>

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { hashPassword } from "../src/server/auth/password.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "db", "migrations");
const TESTS = path.join(ROOT, "db", "tests");
const ROLES = ["admin", "accountant", "principal", "caller", "teacher"];

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(ROOT, file));
  } catch {
    // optional
  }
}

const { positionals, values: opts } = parseArgs({
  allowPositionals: true,
  options: {
    force: { type: "boolean", default: false },
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
  },
});

function fail(message) {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is not set. Copy .env.example to .env.local and point it at your PostgreSQL database.");

const pool = new pg.Pool({ connectionString: url, max: 2 });

async function sqlFiles(dir) {
  return (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
}

async function inTransaction(client, fn) {
  await client.query("begin");
  try {
    const out = await fn();
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('fees.migrate'))");
    await client.query(
      "create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now())",
    );
    const applied = new Set((await client.query("select version from public.schema_migrations")).rows.map((r) => r.version));
    let count = 0;
    for (const file of await sqlFiles(MIGRATIONS)) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(MIGRATIONS, file), "utf8");
      try {
        await inTransaction(client, async () => {
          await client.query(sql);
          await client.query("insert into public.schema_migrations (version) values ($1)", [version]);
        });
      } catch (e) {
        throw new Error(`${file}: ${e.message}`);
      }
      console.log(`applied ${file}`);
      count++;
    }
    console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('fees.migrate'))").catch(() => {});
    client.release();
  }
}

async function seed() {
  const client = await pool.connect();
  try {
    const sql = await readFile(path.join(ROOT, "db", "seed.sql"), "utf8");
    await inTransaction(client, () => client.query(sql));
    console.log("Loaded demo data. Sign in as admin@school.test / admin12345 (caller: pooja@school.test, same password).");
  } finally {
    client.release();
  }
}

async function reset() {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !opts.force) {
    fail(`Refusing to reset the database on ${host}. Re-run with --force if you really mean it.`);
  }
  const client = await pool.connect();
  try {
    await client.query(`
      drop schema if exists public cascade;
      drop schema if exists extensions cascade;
      create schema public;
      grant usage on schema public to public;
    `);
  } finally {
    client.release();
  }
  console.log("Dropped all tables and functions.");
  await migrate();
  await seed();
}

async function test() {
  let failed = 0;
  for (const file of await sqlFiles(TESTS)) {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("set search_path = public, extensions");
      const results = [].concat(await client.query(await readFile(path.join(TESTS, file), "utf8")));
      const lines = results
        .flatMap((r) => r.rows ?? [])
        .map((row) => Object.values(row)[0])
        .filter((v) => typeof v === "string" && /^(ok|not ok|1\.\.|#)/.test(v));
      const bad = lines.filter((l) => l.startsWith("not ok") || l.startsWith("# Looks like"));
      console.log(`${bad.length ? "\x1b[31mFAIL\x1b[0m" : "\x1b[32mPASS\x1b[0m"} ${file} (${lines.filter((l) => l.startsWith("ok")).length} ok)`);
      for (const l of bad) console.log("  " + l.replace(/\n/g, "\n  "));
      if (bad.length) failed++;
    } catch (e) {
      broken = true;
      failed++;
      console.log(`\x1b[31mERROR\x1b[0m ${file}: ${e.message}`);
    } finally {
      client.release(broken);
    }
  }
  if (failed) fail(`${failed} test file(s) failed.`);
}

async function createUser() {
  const email = opts.email?.trim().toLowerCase();
  if (!email || !opts.password) fail("Usage: create-user --email <email> --password <password> [--name <name>] [--role <role>]");
  if (opts.password.length < 8) fail("The password must be at least 8 characters.");
  if (opts.role && !ROLES.includes(opts.role)) fail(`--role must be one of: ${ROLES.join(", ")}`);
  const hash = await hashPassword(opts.password);
  const client = await pool.connect();
  try {
    const profile = await inTransaction(client, async () => {
      const { rows } = await client.query("insert into public.app_users (email, password_hash) values ($1, $2) returning id", [email, hash]);
      // the on_app_user_created trigger made the profile; the first login is admin
      const { rows: p } = await client.query(
        `update public.profiles set full_name = coalesce($2, full_name), role = coalesce($3::public.app_role, role)
          where id = $1 returning role`,
        [rows[0].id, opts.name?.trim() || null, opts.role ?? null],
      );
      return p[0];
    });
    console.log(`Created ${email} with role ${profile.role ?? "none (an admin assigns it in Settings → Staff)"}.`);
  } catch (e) {
    if (e.code === "23505") fail(`A login for ${email} already exists. Use set-password to change its password.`);
    throw e;
  } finally {
    client.release();
  }
}

async function setPassword() {
  const email = opts.email?.trim().toLowerCase();
  if (!email || !opts.password) fail("Usage: set-password --email <email> --password <password>");
  if (opts.password.length < 8) fail("The password must be at least 8 characters.");
  const { rowCount } = await pool.query("update public.app_users set password_hash = $2 where lower(email) = $1", [
    email,
    await hashPassword(opts.password),
  ]);
  if (!rowCount) fail(`No login found for ${email}.`);
  console.log(`Password changed for ${email}.`);
}

const commands = { migrate, seed, reset, test, "create-user": createUser, "set-password": setPassword };
const command = commands[positionals[0]];
if (!command) fail(`Unknown command "${positionals[0] ?? ""}". Use one of: ${Object.keys(commands).join(", ")}.`);

try {
  await command();
} catch (e) {
  fail(e.message);
} finally {
  await pool.end();
}
