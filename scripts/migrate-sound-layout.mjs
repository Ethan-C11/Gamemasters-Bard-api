/**
 * One-off migration for the "sound has a zone AND an ambiance" change.
 *
 *  1. MinIO: flattens `sounds/<type>/<userId>/<file>` into `sounds/<userId>/<file>` and updates audio_track.storageKey
 *  2. Postgres: converts the legacy sound types: `zone` -> `environment`, `ambiance` -> `music` (see LEGACY_TYPE_MAPPING)
 *  3. Postgres: renames the column audio_track."ambianceMusic" to audio_track.ambiance
 *  4. Reports the sounds that still miss a zone or an ambiance (they must be completed by hand)
 *
 * Run it BEFORE starting the API with the new entities (schema synchronize fails on legacy rows).
 * It is a dry run unless --apply is given, and it can safely be run several times.
 *
 *   node --env-file=.env scripts/migrate-sound-layout.mjs [--apply]
 *
 * From the host (outside Docker), DATABASE_URL and S3_ENDPOINT must point to localhost
 * (postgresql://...@localhost:5432/... and http://localhost:9000).
 */
import pg from "pg";
import { Client as MinioClient } from "minio";

const apply = process.argv.includes("--apply");
const LEGACY_KEY = /^sounds\/[^/]+\/(\d+)\/(.+)$/;
const LEGACY_TYPE_MAPPING = { zone: "environment", ambiance: "music" };

const endpoint = new URL(process.env.S3_ENDPOINT);
const bucket = process.env.S3_BUCKET;
const minio = new MinioClient({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port) || (endpoint.protocol === "https:" ? 443 : 80),
    useSSL: endpoint.protocol === "https:",
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION,
});

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
    console.log(apply ? "== APPLY MODE ==" : "== DRY RUN (add --apply to write) ==");

    const legacyColumn = await db.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'audio_track' AND column_name = 'ambianceMusic'`
    );
    let ambianceColumn = legacyColumn.rowCount > 0 ? `"ambianceMusic"` : "ambiance";
    if (ambianceColumn !== "ambiance") {
        console.log(`${apply ? "rename" : "would rename"}  column audio_track.${ambianceColumn} -> ambiance`);
        if (apply) {
            await db.query(`ALTER TABLE audio_track RENAME COLUMN "ambianceMusic" TO ambiance`);
            ambianceColumn = "ambiance";
        }
    }

    const { rows } = await db.query(
        `SELECT id, name, "storageKey", "mimeType", "sizeInBytes", zone, ${ambianceColumn} AS ambiance FROM audio_track ORDER BY id`
    );
    const usedKeys = new Set(rows.map((row) => row.storageKey));
    const conflicts = [];
    let moved = 0;

    for (const row of rows) {
        const match = LEGACY_KEY.exec(row.storageKey);
        if (!match) continue;

        const newKey = `sounds/${match[1]}/${match[2]}`;
        if (newKey === row.storageKey) continue;

        if (usedKeys.has(newKey)) {
            conflicts.push({ id: row.id, from: row.storageKey, to: newKey });
            continue;
        }

        console.log(`${apply ? "move" : "would move"}  ${row.storageKey}  ->  ${newKey}`);
        usedKeys.delete(row.storageKey);
        usedKeys.add(newKey);
        moved++;

        if (!apply) continue;

        const stream = await minio.getObject(bucket, row.storageKey);
        await minio.putObject(bucket, newKey, stream, Number(row.sizeInBytes), { "Content-Type": row.mimeType });
        await db.query(`UPDATE audio_track SET "storageKey" = $1 WHERE id = $2`, [newKey, row.id]);
        await minio.removeObject(bucket, row.storageKey);
    }
    console.log(`${moved} file(s) ${apply ? "moved" : "to move"}.`);

    const legacyTypes = await db.query(
        `SELECT type::text AS type, count(*)::int AS total FROM audio_track
         WHERE type::text IN ('zone', 'ambiance') GROUP BY type`
    ).catch(() => ({ rows: [] }));
    for (const { type, total } of legacyTypes.rows)
        console.log(`${apply ? "convert" : "would convert"}  ${total} sound(s) of type '${type}' -> '${LEGACY_TYPE_MAPPING[type]}'`);

    if (apply && legacyTypes.rows.length > 0) {
        await db.query(`ALTER TYPE audio_track_type_enum ADD VALUE IF NOT EXISTS 'music'`);
        await db.query(`ALTER TYPE audio_track_type_enum ADD VALUE IF NOT EXISTS 'environment'`);
        for (const [legacy, target] of Object.entries(LEGACY_TYPE_MAPPING))
            await db.query(`UPDATE audio_track SET type = $1 WHERE type::text = $2`, [target, legacy]);
    }

    const incomplete = rows.filter((row) => row.zone === null || row.ambiance === null);
    if (conflicts.length > 0) {
        console.error("\nKey conflicts (same file name already stored for this user), rename one of them and run again:");
        for (const conflict of conflicts) console.error(`  #${conflict.id}  ${conflict.from}  ->  ${conflict.to}`);
    }
    if (incomplete.length > 0) {
        console.error("\nSounds missing a zone or an ambiance, complete them before starting the API:");
        for (const row of incomplete)
            console.error(`  #${row.id} "${row.name}"  zone=${row.zone}  ambiance=${row.ambiance}`);
        console.error(`  e.g. UPDATE audio_track SET zone = 'forest', ${ambianceColumn} = 'calm' WHERE id = <id>;`);
    }
    if (conflicts.length > 0 || incomplete.length > 0) process.exitCode = 1;
    else console.log("\nAll sounds are consistent.");
} finally {
    await db.end();
}
