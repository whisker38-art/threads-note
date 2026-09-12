#!/usr/bin/env node
/**
 * schedule.json 을 보고 시간이 된 원고를 발행한다.
 * GitHub Actions 가 30분마다 이 파일을 실행한다. PC 전원과 무관하다.
 *
 *   node run_schedule.mjs          시간 된 것 한 편 발행
 *   node run_schedule.mjs --dry    무엇이 나갈지만 확인
 *
 * 한 번 실행에 한 편만 올린다. 여러 개가 밀려 있어도 한꺼번에 쏟지 않는다.
 * 발행한 항목에는 published 를 기록해 다시 나가지 않게 한다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync }
  from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish } from './threads_publish.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FILE = join(ROOT, 'schedule.json');
const REPO = process.env.GITHUB_REPOSITORY || 'whisker38-art/threads-note';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';
const dry = process.argv.includes('--dry');

// 너무 오래 지난 건 올리지 않는다 (하루 이상 밀렸으면 그 글은 시의성을 잃는다)
const MAX_LATE_MS = 6 * 60 * 60 * 1000;

function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[2].trim()) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function imageUrls(file) {
  const num = basename(file).match(/^(\d+)/)?.[1];
  if (!num) return [];
  const dir = join(ROOT, 'images', num);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map((f) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/images/${num}/${f}`);
}

function note(line) {
  mkdirSync(join(ROOT, 'logs'), { recursive: true });
  appendFileSync(join(ROOT, 'logs', 'schedule.log'),
    `${new Date().toISOString()}\t${line}\n`, 'utf8');
}

loadEnv();
if (!process.env.THREADS_ACCESS_TOKEN) {
  console.error('❌ THREADS_ACCESS_TOKEN 이 없습니다.');
  process.exit(1);
}

const items = JSON.parse(readFileSync(FILE, 'utf8'));
const now = Date.now();

const due = items
  .map((it, i) => ({ ...it, i, ts: Date.parse(it.at) }))
  .filter((it) => !it.published && !it.skipped && it.ts <= now)
  .sort((a, b) => a.ts - b.ts);

if (!due.length) {
  console.log('⏳ 아직 시간이 된 원고가 없습니다.');
  process.exit(0);
}

const pick = due[0];
const late = now - pick.ts;

if (late > MAX_LATE_MS) {
  items[pick.i].skipped = `${Math.round(late / 60000)}분 지연으로 건너뜀`;
  writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8');
  note(`SKIP ${pick.post} (${Math.round(late / 60000)}분 지연)`);
  console.log(`⏭  ${pick.post} — 너무 늦어서 건너뜁니다 (${Math.round(late / 60000)}분 지연)`);
  process.exit(0);
}

const path = join(ROOT, pick.post);
if (!existsSync(path)) {
  note(`FAIL 원고없음 ${pick.post}`);
  console.error(`❌ 없는 원고: ${pick.post}`);
  process.exit(1);
}

const text = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
if (text.length > 500) {
  note(`FAIL 500자초과 ${pick.post}`);
  console.error(`❌ ${pick.post} 가 ${text.length}자입니다.`);
  process.exit(1);
}

const images = imageUrls(pick.post);
console.log(`📄 ${pick.post}  예정 ${pick.at}  (${Math.round(late / 60000)}분 지연, ` +
            `${text.length}자, 이미지 ${images.length}장)`);

const id = await publish({
  token: process.env.THREADS_ACCESS_TOKEN,
  userId: process.env.THREADS_USER_ID,
  text, images, dry,
});

if (dry) { console.log('🟡 --dry 라서 기록하지 않았습니다.'); process.exit(0); }

items[pick.i].published = { at: new Date().toISOString(), id, late_min: Math.round(late / 60000) };
writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8');
note(`OK ${pick.post} id=${id} 지연 ${Math.round(late / 60000)}분`);

const left = items.filter((x) => !x.published && !x.skipped).length;
console.log(`\n🗂  기록 완료 · 남은 예약 ${left}건`);
