import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { type TestContext, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import {
	LockFile,
	LockFileAcquiredByOtherProcessError,
	LockFileAlreadyReleasedError,
} from "./lockfile";

async function exists(path: string) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

const baseDirectory = env.TEST_BASE_DIRECTORY ?? tmpdir();

const lockfilePath = async () => {
	const directory = await mkdtemp(
		join(baseDirectory, "device-database-testing-lockfile"),
	);

	return {
		path: join(directory, "lock"),
		[Symbol.asyncDispose]: async () => {
			await rm(directory, { recursive: true, force: true });
		},
	};
};

test("lockfile", (t: TestContext) => {
	t.test("acquires and releases lock", async () => {
		await using p = await lockfilePath();

		await using lock = new LockFile(p.path);

		await lock.acquire();
		t.assert.ok(await exists(p.path));

		await lock.release();
		t.assert.ok(!(await exists(p.path)));
	});

	t.test("disposes lock", async () => {
		await using p = await lockfilePath();

		{
			await using lock = new LockFile(p.path);

			await lock.acquire();
			t.assert.ok(await exists(p.path));
		}

		t.assert.ok(!(await exists(p.path)));
	});

	t.test("prevents double acquisition", async () => {
		await using p = await lockfilePath();

		await using lock1 = new LockFile(p.path);
		await using lock2 = new LockFile(p.path);

		await lock1.acquire();

		await t.assert.rejects(async () => {
			await lock2.acquire();
		}, LockFileAcquiredByOtherProcessError);
	});

	t.test("reclaims stale lock", async () => {
		await using p = await lockfilePath();

		await using lock1 = new LockFile(p.path, {
			staleMs: 50,
			// slower than stale → becomes stale
			updateIntervalMs: 1_000_000,
		});

		await lock1.acquire();

		// wait until stale
		await sleep(100);

		await using lock2 = new LockFile(p.path, {
			staleMs: 100,
			updateIntervalMs: 50,
		});

		// reclaim
		await lock2.acquire();
	});

	t.test("updates mtime regularly", async () => {
		await using p = await lockfilePath();

		await using lock = new LockFile(p.path, {
			updateIntervalMs: 100,
			staleMs: 1000,
		});

		await lock.acquire();

		const stat1 = await stat(p.path);
		await sleep(200);
		const stat2 = await stat(p.path);

		t.assert.ok(stat2.mtimeMs > stat1.mtimeMs, "mtime should increase");
	});

	t.test("release is not idempotent", async () => {
		await using p = await lockfilePath();

		await using lock = new LockFile(p.path);

		await lock.acquire();
		await lock.release();

		await t.assert.rejects(async () => {
			await lock.release();
		}, LockFileAlreadyReleasedError);

		t.assert.equal(await exists(p.path), false);
	});
});
