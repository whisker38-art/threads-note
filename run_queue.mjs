#!/usr/bin/env node
/**
 * queue.txt 맨 위 원고 한 편을 발행하고, 그 줄을 published.txt로 옮긴다.
 * GitHub Actions가 정해진 시간에 이 파일을 실행한다.
 *
 *   node run_queue.mjs          한 편 발행
 *   node run_queue.mjs --dry    발행하지 않고 무엇이 나갈지만 확인
 *
 * 이미지: 원고 이름 앞의 숫자로 images/<숫자>/ 폴더를 찾는다.
 *         (08_여러개.txt → images/08/*.jpg) 폴더가 없으면 텍스트만 올린다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish } from './threads_publish.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(ROOT, 'queue.txt');
const DONE = join(ROOT, 'published.txt');
const REPO = process.env.GITHUB_REPOSITORY || 'whisker38-art/threads-note';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';
const dry = process.argv.includes('--dry');

function loadEnvFile() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[2].trim()) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function nextEntry() {
  if (!existsSync(QUEUE)) return null;
  const lines = readFileSync(QUEUE, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim() && !l.trim().startsWith('#'));
  return i === -1 ? null : { line: lines[i].trim(), index: i, lines };
}

function imageUrls(postFile) {
  const num = basename(postFile).match(/^(\d+)/)?.[1];
  if (!num) return [];
  const dir = join(ROOT, 'images', num);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map((f) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/images/${num}/${f}`);
}

async function main() {
  loadEnvFile();
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ THREADS_ACCESS_TOKEN 이 없습니다. (Actions Secrets 확인)');
    process.exit(1);
  }

  const entry = nextEntry();
  if (!entry) {
    console.log('📭 queue.txt 가 비었습니다. 발행할 원고가 없어 그냥 끝냅니다.');
    return;                                   // 실패로 처리하지 않는다
  }

  const postPath = join(ROOT, entry.line);
  if (!existsSync(postPath)) {
    console.error(`❌ 원고를 찾을 수 없습니다: ${entry.line}`);
    process.exit(1);
  }

  const text = readFileSync(postPath, 'utf8').replace(/^﻿/, '').trim();
  if (text.length > 500) {
    console.error(`❌ ${entry.line} 이 ${text.length}자입니다. 500자를 넘습니다.`);
    process.exit(1);
  }
  const images = imageUrls(entry.line);

  console.log(`📄 ${entry.line}  (${text.length}자, 이미지 ${images.length}장)`);

  const id = await publish({
    token,
    userId: process.env.THREADS_USER_ID,
    text,
    images,
    dry,
  });
  if (dry) return;

  // 발행한 줄을 큐에서 빼고 기록으로 옮긴다
  entry.lines.splice(entry.index, 1);
  writeFileSync(QUEUE, entry.lines.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
  appendFileSync(DONE, `${new Date().toISOString()}\t${entry.line}\t${id}\n`, 'utf8');
  console.log(`\n🗂  큐에서 제거 · published.txt 에 기록`);
}

main().catch((e) => { console.error(e?.stack ?? String(e)); process.exit(1); });
