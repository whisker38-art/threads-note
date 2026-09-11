#!/usr/bin/env node
/**
 * Threads API 게시 스크립트
 *
 *   node threads_publish.mjs --me
 *   node threads_publish.mjs --text "올릴 내용"
 *   node threads_publish.mjs --file posts/08_여러개.txt
 *   node threads_publish.mjs --file posts/08_여러개.txt --images "https://…/01.jpg,https://…/02.jpg"
 *   node threads_publish.mjs --text "답글" --reply-to 17912345678901234
 *   node threads_publish.mjs --text "내용" --dry
 *
 * 게시는 컨테이너 생성 → 발행 2단계.
 * 이미지가 2장 이상이면 캐러셀(각 장 컨테이너 → 묶음 컨테이너 → 발행)로 처리한다.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.threads.net/v1.0';

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;                 // CI에서는 환경변수로 들어온다
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (v !== '') process.env[m[1]] = v;
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, params) {
  const url = new URL(`${API}${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (method === 'GET') url.searchParams.set(k, v); else body.set(k, v);
  }
  const res = await fetch(url, method === 'GET' ? { method } : {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok || json.error) {
    const e = json.error ?? {};
    console.error(`\n❌ Threads API 오류 (HTTP ${res.status})`);
    console.error(`   ${e.message ?? text}`);
    if (e.code) console.error(`   code=${e.code} subcode=${e.error_subcode ?? '-'}`);
    if (res.status === 401 || e.code === 190)
      console.error('   → 토큰이 만료됐거나 잘못됐습니다. 토큰을 다시 발급하세요.');
    if ([4, 32, 613].includes(e.code))
      console.error('   → 요청 한도에 걸렸습니다. 시간을 두고 다시 시도하세요.');
    process.exit(1);
  }
  return json;
}

const getMe = (token) =>
  call('GET', '/me', { fields: 'id,username', access_token: token });

async function waitReady(id, token, { tries = 25, interval = 3000 } = {}) {
  for (let i = 1; i <= tries; i++) {
    const s = await call('GET', `/${id}`, { fields: 'status,error_message', access_token: token });
    if (s.status === 'FINISHED') return;
    if (s.status === 'ERROR' || s.status === 'EXPIRED')
      fail(`컨테이너 처리 실패: ${s.status} ${s.error_message ?? ''}`);
    process.stdout.write(`   대기 중… (${i}/${tries}, ${s.status})\r`);
    await sleep(interval);
  }
  fail('제한 시간 안에 준비되지 않았습니다. 이미지 URL이 외부에서 열리는지 확인하세요.');
}

function logPost(entry) {
  const dir = join(ROOT, 'logs');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'posts.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
}

export async function publish({ token, userId, text, images = [], replyTo, dry = false }) {
  const uid = userId || (await getMe(token)).id;
  const type = images.length > 1 ? 'CAROUSEL' : images.length === 1 ? 'IMAGE' : 'TEXT';

  console.log(`\n게시 준비`);
  console.log(`  종류   : ${type}${images.length ? ` (이미지 ${images.length}장)` : ''}`);
  console.log(`  글자수 : ${text.length}자`);
  console.log(`  본문   : ${text.slice(0, 60).replace(/\n/g, ' ')}${text.length > 60 ? '…' : ''}`);

  if (dry) { console.log('\n🟡 --dry 라서 실제 게시는 하지 않았습니다.\n'); return null; }

  let containerId;
  if (type === 'CAROUSEL') {
    console.log('\n[1/3] 장별 컨테이너 생성…');
    const children = [];
    for (const [i, url] of images.entries()) {
      const c = await call('POST', `/${uid}/threads`, {
        media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: token,
      });
      console.log(`      ${i + 1}/${images.length}  ${c.id}`);
      children.push(c.id);
    }
    console.log('[2/3] 이미지 처리 대기…');
    for (const id of children) await waitReady(id, token);
    const carousel = await call('POST', `/${uid}/threads`, {
      media_type: 'CAROUSEL', children: children.join(','), text,
      reply_to_id: replyTo, access_token: token,
    });
    containerId = carousel.id;
    await waitReady(containerId, token);
  } else {
    console.log('\n[1/2] 컨테이너 생성…');
    const c = await call('POST', `/${uid}/threads`, {
      media_type: type, text, image_url: images[0], reply_to_id: replyTo, access_token: token,
    });
    containerId = c.id;
    if (type === 'TEXT') await sleep(3000); else await waitReady(containerId, token);
  }

  console.log('[발행]');
  const published = await call('POST', `/${uid}/threads_publish`, {
    creation_id: containerId, access_token: token,
  });
  const info = await call('GET', `/${published.id}`, {
    fields: 'permalink,timestamp', access_token: token,
  }).catch(() => ({}));

  logPost({
    at: new Date().toISOString(), id: published.id, media_type: type,
    images: images.length, text, permalink: info.permalink ?? null,
  });

  console.log(`\n✅ 게시 완료`);
  console.log(`   post id : ${published.id}`);
  if (info.permalink) console.log(`   링크    : ${info.permalink}`);
  return published.id;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token || token.includes('여기에'))
    fail('THREADS_ACCESS_TOKEN 이 비어 있습니다. (.env 또는 환경변수)');

  if (args.me) {
    const me = await getMe(token);
    console.log(`\n✅ 토큰 정상\n   user id : ${me.id}\n   username: @${me.username}\n`);
    return;
  }

  let text = args.text;
  if (args.file) {
    const p = isAbsolute(args.file) ? args.file : join(ROOT, args.file);
    text = readFileSync(p, 'utf8').replace(/^﻿/, '').trim();
  }
  if (typeof text !== 'string' || text.trim() === '')
    fail('올릴 내용이 없습니다. --text 또는 --file 을 주세요.');
  text = text.trim();
  if (text.length > 500) fail(`본문이 ${text.length}자입니다. 한 게시물은 500자까지입니다.`);

  const images = typeof args.images === 'string'
    ? args.images.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (images.length > 20) fail('캐러셀은 최대 20장입니다.');

  await publish({
    token,
    userId: process.env.THREADS_USER_ID,
    text,
    images,
    replyTo: typeof args['reply-to'] === 'string' ? args['reply-to'] : undefined,
    dry: !!args.dry,
  });
}

if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('threads_publish.mjs')) {
  main().catch((e) => fail(e?.stack ?? String(e)));
}
