#!/usr/bin/env node
/**
 * 원고 한 편을 발행한다. 이미지는 이름 앞 숫자로 images/<숫자>/ 를 찾아 자동으로 붙인다.
 * 예약 발행(작업 스케줄러)에서 부르는 진입점.
 *
 *   node publish_one.mjs posts/13_에어팟5.txt
 *   node publish_one.mjs posts/13_에어팟5.txt --dry
 */
import { readFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish } from './threads_publish.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = 'whisker38-art/threads-note';
const BRANCH = 'main';

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

const rel = process.argv[2];
const dry = process.argv.includes('--dry');
if (!rel) { console.error('원고 파일을 지정하세요.'); process.exit(1); }

loadEnv();
const path = isAbsolute(rel) ? rel : join(ROOT, rel);
if (!existsSync(path)) { note(`FAIL 원고없음 ${rel}`); console.error(`없는 파일: ${rel}`); process.exit(1); }

const text = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
if (text.length > 500) { note(`FAIL 500자초과 ${rel} (${text.length}자)`); console.error('500자 초과'); process.exit(1); }

const images = imageUrls(rel);
console.log(`📄 ${rel} (${text.length}자, 이미지 ${images.length}장)`);

try {
  const id = await publish({
    token: process.env.THREADS_ACCESS_TOKEN,
    userId: process.env.THREADS_USER_ID,
    text, images, dry,
  });
  note(dry ? `DRY ${rel}` : `OK ${rel} id=${id} img=${images.length}`);
} catch (e) {
  note(`FAIL ${rel} ${e?.message ?? e}`);
  console.error(e);
  process.exit(1);
}
