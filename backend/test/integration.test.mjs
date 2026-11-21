import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PORT = 3097;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MAIN_JS = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

let serverProc = null;
let serverStderr = '';

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response
  }
  return { status: res.status, json, text };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Backend failed to start on port ${PORT}: ${serverStderr}`);
}

describe('LeLije Backend HTTP Integration Suite', () => {
  before(async () => {
    assert.ok(
      existsSync(MAIN_JS),
      'backend/dist/main.js missing — run npm run build --workspace=backend first',
    );
    serverProc = spawn('node', [MAIN_JS], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_URL: '',
        SEED_DEMO_FAMILY: 'true',
        AI_LOG_SILENT: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stderr.on('data', (chunk) => {
      serverStderr += chunk.toString();
    });
    await waitForHealth();
  });

  after(() => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
    }
  });

  it('serves health endpoint, frontend SPA, and MediaPipe vision assets', async () => {
    const checks = [
      ['/api/health', 5],
      ['/', 200],
      ['/models/pose_landmarker_lite.task', 1_000_000],
      ['/wasm/vision_wasm_internal.wasm', 1_000_000],
      ['/wasm/vision_wasm_internal.js', 100_000],
    ];
    for (const [path, minBytes] of checks) {
      const res = await fetch(`${BASE_URL}${path}`);
      assert.equal(res.status, 200, `${path} expected HTTP 200`);
      const buf = await res.arrayBuffer();
      assert.ok(
        buf.byteLength >= minBytes,
        `${path} expected >= ${minBytes} bytes, got ${buf.byteLength}`,
      );
    }
  });

  it('seeds the fixed LELIJE demo family idempotently on startup', async () => {
    const fam = await api('/api/families/LELIJE');
    assert.equal(fam.status, 200);
    assert.equal(fam.json.code, 'LELIJE');
    assert.equal(fam.json.hasPin, true);
    assert.equal(fam.json.children.length, 3);

    const langs = fam.json.children.map((c) => c.language).sort();
    assert.deepEqual(langs, ['am', 'en', 'om']);

    const pinOk = await api('/api/families/LELIJE/pin/check', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    });
    assert.equal(pinOk.status, 200);
    assert.equal(pinOk.json.ok, true);

    const reviews = await api('/api/families/LELIJE/reviews');
    assert.equal(reviews.status, 200);
    assert.ok(reviews.json.length >= 1, 'Expected seeded pending review');

    const playReqs = await api('/api/families/LELIJE/play-requests');
    assert.equal(playReqs.status, 200);
    assert.ok(
      playReqs.json.some((r) => r.status === 'sent'),
      'Expected seeded open play request',
    );

    const activity = await api('/api/families/LELIJE/activity?days=7');
    assert.equal(activity.status, 200);
    assert.ok(activity.json.items.length >= 4);

    const report = await api('/api/families/LELIJE/report?days=7');
    assert.equal(report.status, 200);
    const beka = report.json.children.find((c) => c.nickname === 'Beka');
    assert.ok(beka && beka.streak >= 3, 'Expected Beka to have a 3-day streak');
  });

  it('generates valid Contract B missions in EN, AM, and OM with camera on/off', async () => {
    const fam = await api('/api/families', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mission Test Family', pin: '2468' }),
    });
    assert.equal(fam.status, 201);
    const code = fam.json.code;

    const specs = [
      { nickname: 'Lia', age: 7, language: 'en', cameraAvailable: true },
      { nickname: 'Beka', age: 9, language: 'am', cameraAvailable: true },
      { nickname: 'Chaltu', age: 6, language: 'om', cameraAvailable: false },
    ];

    for (const spec of specs) {
      const child = await api('/api/children', {
        method: 'POST',
        body: JSON.stringify({
          familyCode: code,
          nickname: spec.nickname,
          age: spec.age,
          language: spec.language,
        }),
      });
      assert.equal(child.status, 201);

      const res = await api('/api/missions', {
        method: 'POST',
        body: JSON.stringify({
          childId: child.json.id,
          count: 3,
          space: 'small-indoor',
          cameraAvailable: spec.cameraAvailable,
        }),
      });
      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.json.missions.length, 3);
      assert.ok(['ai', 'fallback', 'mixed'].includes(res.json.source));

      for (const m of res.json.missions) {
        assert.equal(typeof m.id, 'string');
        assert.equal(typeof m.title, 'string');
        assert.equal(typeof m.description, 'string');
        assert.equal(typeof m.points, 'number');
        assert.equal(typeof m.durationMin, 'number');
        assert.ok(m.verification === 'pose' || m.verification === 'self');
        if (m.verification === 'pose') {
          assert.ok(m.goal && (m.goal.detector === 'jump' || m.goal.detector === 'armsUp'));
          assert.ok(typeof m.goal.count === 'number' && m.goal.count > 0);
        }
      }

      if (spec.cameraAvailable) {
        assert.ok(
          res.json.missions.some((m) => m.verification === 'pose'),
          `Expected at least one pose mission for ${spec.language} when camera is available`,
        );
      } else {
        assert.ok(
          res.json.missions.every((m) => m.verification === 'self'),
          'Expected only self missions when cameraAvailable is false',
        );
      }
    }
  });

  it('enforces Phases 4–8 workflows, audience isolation, daily cap, and PIN lockout', async () => {
    const missing = await api('/api/families/NO-SUCH-CODE');
    assert.equal(missing.status, 404);

    const fam = await api('/api/families', {
      method: 'POST',
      body: JSON.stringify({ name: 'Workflow Family', pin: '4321' }),
    });
    assert.equal(fam.status, 201);
    const code = fam.json.code;

    const c1 = await api('/api/children', {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, nickname: 'Hana', age: 8, language: 'en' }),
    });
    const c2 = await api('/api/children', {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, nickname: 'Dawit', age: 10, language: 'am' }),
    });
    const child1 = c1.json.id;
    const child2 = c2.json.id;

    const mRes = await api('/api/missions', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        count: 3,
        space: 'small-indoor',
        cameraAvailable: true,
      }),
    });
    const missions = mRes.json.missions;
    const poseMission = missions.find((m) => m.verification === 'pose');
    const selfMission = missions.find((m) => m.verification === 'self');
    assert.ok(poseMission && selfMission);

    // Phase 4: pose auto-approves; self enters pending -> reject -> redo -> approve
    const compPose = await api('/api/missions/complete', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        missionId: poseMission.id,
        verifiedBy: 'pose',
        result: { count: poseMission.goal.count, durationMs: 20_000 },
        completedAt: new Date().toISOString(),
      }),
    });
    assert.equal(compPose.json.status, 'approved');
    assert.equal(compPose.json.pointsAwarded, poseMission.points);

    // Duplicate pose completion awards 0 points
    const compPoseDup = await api('/api/missions/complete', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        missionId: poseMission.id,
        verifiedBy: 'pose',
        result: { count: poseMission.goal.count, durationSec: 20 },
        completedAt: new Date().toISOString(),
      }),
    });
    assert.equal(compPoseDup.json.alreadyCompleted, true);
    assert.equal(compPoseDup.json.pointsAwarded, 0);

    const compSelf = await api('/api/missions/complete', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        missionId: selfMission.id,
        verifiedBy: 'self',
        completedAt: new Date().toISOString(),
      }),
    });
    assert.equal(compSelf.json.status, 'pending');
    assert.equal(compSelf.json.pointsAwarded, 0);

    const reviews = await api(`/api/families/${code}/reviews`);
    assert.equal(reviews.json.length, 1);

    const rejected = await api(`/api/completions/${reviews.json[0].id}/review`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '4321', decision: 'reject' }),
    });
    assert.equal(rejected.json.status, 'rejected');

    // Child redoes rejected self mission
    const compRedo = await api('/api/missions/complete', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        missionId: selfMission.id,
        verifiedBy: 'self',
        completedAt: new Date().toISOString(),
      }),
    });
    assert.equal(compRedo.json.status, 'pending');

    const reviewsAfterRedo = await api(`/api/families/${code}/reviews`);
    const approved = await api(`/api/completions/${reviewsAfterRedo.json[0].id}/review`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '4321', decision: 'approve' }),
    });
    assert.equal(approved.json.status, 'approved');
    assert.equal(approved.json.pointsAwarded, selfMission.points);

    // Phase 5: Play Time idempotency + answer
    const play1 = await api('/api/play-requests', {
      method: 'POST',
      body: JSON.stringify({ childId: child1 }),
    });
    assert.equal(play1.json.alreadyAsked, false);
    const play2 = await api('/api/play-requests', {
      method: 'POST',
      body: JSON.stringify({ childId: child1 }),
    });
    assert.equal(play2.json.alreadyAsked, true);
    assert.equal(play2.json.id, play1.json.id);

    const playAns = await api(`/api/play-requests/${play1.json.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '4321', answer: 'allowed' }),
    });
    assert.equal(playAns.json.status, 'allowed');
    assert.equal(playAns.json.alreadyAnswered, false);

    const playAnsDup = await api(`/api/play-requests/${play1.json.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '4321', answer: 'later' }),
    });
    assert.equal(playAnsDup.json.alreadyAnswered, true);

    // Phase 6: Notifications audience isolation & independent read state
    const nParent = await api(`/api/families/${code}/notifications?audience=parent`);
    const nChild1 = await api(
      `/api/families/${code}/notifications?audience=child&childId=${child1}`,
    );
    const nChild2 = await api(
      `/api/families/${code}/notifications?audience=child&childId=${child2}`,
    );
    assert.ok(nParent.json.unread >= 1);
    assert.ok(nChild1.json.unread >= 1);
    assert.equal(nChild2.json.unread, 0);

    await api(`/api/families/${code}/notifications/read`, {
      method: 'POST',
      body: JSON.stringify({ audience: 'parent' }),
    });
    assert.equal(
      (await api(`/api/families/${code}/notifications?audience=parent`)).json.unread,
      0,
    );
    assert.ok(
      (
        await api(
          `/api/families/${code}/notifications?audience=child&childId=${child1}`,
        )
      ).json.unread >= 1,
    );

    // Phase 8: Catch the Stars first-play scoring & second-play cap
    const g1 = await api('/api/games/result', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        game: 'catch-the-stars',
        result: {
          score: 80,
          starsCaught: 30,
          goldenCaught: 10,
          jumps: 18,
          armsUp: 14,
          durationMs: 45_000,
        },
      }),
    });
    assert.equal(g1.status, 200);
    assert.equal(g1.json.pointsAwarded, 30); // min(30, floor(80/2))
    assert.equal(g1.json.alreadyRecorded, false);
    assert.equal(g1.json.dailyCap, 100);

    const g2 = await api('/api/games/result', {
      method: 'POST',
      body: JSON.stringify({
        childId: child1,
        game: 'catch-the-stars',
        result: {
          score: 50,
          starsCaught: 20,
          goldenCaught: 5,
          jumps: 10,
          armsUp: 8,
          durationMs: 45_000,
        },
      }),
    });
    assert.equal(g2.json.pointsAwarded, 0);
    assert.equal(g2.json.alreadyRecorded, true);

    // Phase 7: Activity feed & 7-day report
    const act = await api(`/api/families/${code}/activity?days=7`);
    assert.equal(act.status, 200);
    assert.ok(act.json.items.some((item) => item.kind === 'mission'));
    assert.ok(act.json.items.some((item) => item.kind === 'game'));

    const rep = await api(`/api/families/${code}/report?days=7`);
    assert.equal(rep.status, 200);
    const c1Rep = rep.json.children.find((c) => c.childId === child1);
    assert.equal(c1Rep.totalPoints, poseMission.points + selfMission.points + 30);
    assert.equal(c1Rep.pointsInPeriod, c1Rep.totalPoints);
    assert.equal(c1Rep.streak, 1);
    assert.equal(c1Rep.period.missionsApproved, 2);
    assert.equal(c1Rep.period.gamesPlayed, 1);

    // Phase 4: PIN 403 -> 5-strike 429 lockout
    const lockPlay = await api('/api/play-requests', {
      method: 'POST',
      body: JSON.stringify({ childId: child2 }),
    });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const bad = await api(`/api/play-requests/${lockPlay.json.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ familyCode: code, pin: '0000', answer: 'allowed' }),
      });
      assert.equal(bad.status, 403, `Attempt ${attempt} should return 403`);
    }
    const fifth = await api(`/api/play-requests/${lockPlay.json.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '0000', answer: 'allowed' }),
    });
    assert.equal(fifth.status, 429);

    const blockedEvenWhenValid = await api(`/api/play-requests/${lockPlay.json.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ familyCode: code, pin: '4321', answer: 'allowed' }),
    });
    assert.equal(blockedEvenWhenValid.status, 429);
  });

  it('authenticates parents and children with signed Bearer tokens and revokes sessions on logout', async () => {
    const noAuth = await api('/api/auth/me');
    assert.equal(noAuth.status, 401);

    const badPin = await api('/api/auth/parent-login', {
      method: 'POST',
      body: JSON.stringify({ familyCode: 'LELIJE', pin: '9999' }),
    });
    assert.equal(badPin.status, 403);

    const parentAuth = await api('/api/auth/parent-login', {
      method: 'POST',
      body: JSON.stringify({ familyCode: 'LELIJE', pin: '1234' }),
    });
    assert.equal(parentAuth.status, 200);
    assert.equal(parentAuth.json.role, 'parent');
    assert.equal(parentAuth.json.family.code, 'LELIJE');
    assert.equal(typeof parentAuth.json.token, 'string');

    const meParent = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${parentAuth.json.token}` },
    });
    assert.equal(meParent.status, 200);
    assert.equal(meParent.json.role, 'parent');
    assert.equal(meParent.json.family.code, 'LELIJE');

    // Tampered token is rejected
    const tampered = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${parentAuth.json.token}x` },
    });
    assert.equal(tampered.status, 401);

    // Child login verifies family membership
    const firstChild = parentAuth.json.children[0];
    const childAuth = await api('/api/auth/child-login', {
      method: 'POST',
      body: JSON.stringify({ familyCode: 'LELIJE', childId: firstChild.id }),
    });
    assert.equal(childAuth.status, 200);
    assert.equal(childAuth.json.role, 'child');
    assert.equal(childAuth.json.child.id, firstChild.id);

    const meChild = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${childAuth.json.token}` },
    });
    assert.equal(meChild.status, 200);
    assert.equal(meChild.json.role, 'child');
    assert.equal(meChild.json.child.id, firstChild.id);

    // Logout revokes the token server-side
    const loggedOut = await api('/api/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${parentAuth.json.token}` },
    });
    assert.equal(loggedOut.status, 200);

    const meAfterLogout = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${parentAuth.json.token}` },
    });
    assert.equal(meAfterLogout.status, 401);
  });
});
