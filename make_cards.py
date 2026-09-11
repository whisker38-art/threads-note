# -*- coding: utf-8 -*-
"""
원고 txt 하나를 카드뉴스로 만든다. 프로필 사진(검정+주황 링)과 같은 톤.

  python make_cards.py posts/08_여러개.txt
  python make_cards.py posts/08_여러개.txt --max 5 --style light

카드 구성
  표지   링 마크 + 주황 룰 + 큰 제목, 아래쪽 정렬(편집 디자인 배치)
  목록   주황 번호 + 흰 본문, 행잉 인덴트
  본문   왼쪽 주황 바 + 본문
  질문   주황 전면 + 검정 글씨 + "댓글로 알려줘"

출력: images/<원고이름>/01.jpg ...
"""
import os, re, math, argparse
from PIL import Image, ImageDraw, ImageFont

W, H, SS = 1080, 1350, 2
M = 96                                   # 바깥 여백
BOLD = r"C:\Windows\Fonts\malgunbd.ttf"
REG = r"C:\Windows\Fonts\malgun.ttf"
ROOT = os.path.dirname(os.path.abspath(__file__))
HANDLE = "@daily_note2021"

THEMES = {
    "dark":  {"bg": "#0B0B0B", "fg": "#FFFFFF", "accent": "#FF6B1A",
              "sub": "#6E6E6E", "askfg": "#0B0B0B", "asksub": "#8A3A0C"},
    "light": {"bg": "#F4EFE6", "fg": "#141414", "accent": "#E8590C",
              "sub": "#8C8377", "askfg": "#FFFFFF", "asksub": "#FFD9BF"},
}


def F(path, size):
    return ImageFont.truetype(path, int(size * SS))


# ── 배경 ────────────────────────────────────────────────────────────────
def glow(im, color, cx, cy, radius, strength=26):
    """구석에서 번지는 은은한 빛. 평평한 검정에 깊이를 준다."""
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    steps = 44
    r_, g_, b_ = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    for i in range(steps, 0, -1):
        rr = radius * i / steps
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=(r_, g_, b_, max(1, int(strength / steps))))
    return Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")


def ring(d, cx, cy, r, w, color, gap_start=300, gap_end=240):
    """프로필 사진과 같은 끊어진 링 마크."""
    d.arc([cx - r, cy - r, cx + r, cy + r], start=gap_start, end=gap_end,
          fill=color, width=int(w))


# ── 텍스트 ──────────────────────────────────────────────────────────────
def wrap(d, text, fnt, max_w):
    lines, line = [], ""
    for word in text.split(" "):
        trial = (line + " " + word).strip()
        if d.textlength(trial, font=fnt) <= max_w:
            line = trial
            continue
        if line:
            lines.append(line)
        while d.textlength(word, font=fnt) > max_w:
            cut = len(word)
            while cut > 1 and d.textlength(word[:cut], font=fnt) > max_w:
                cut -= 1
            lines.append(word[:cut])
            word = word[cut:]
        line = word
    if line:
        lines.append(line)
    return lines


def footer(d, t, index, total, ask=False):
    y = (H - 92) * SS
    dot = t["accent"] if not ask else t["askfg"]
    col = t["sub"] if not ask else t["asksub"]
    d.ellipse([M * SS, y + 9 * SS, (M + 11) * SS, y + 20 * SS], fill=dot)
    d.text(((M + 26) * SS, y), HANDLE, font=F(REG, 29), fill=col)

    if total > 1:                                    # 페이지를 점으로
        r, gapd = 7, 24
        tot_w = total * r * 2 + (total - 1) * (gapd - r * 2)
        x = W * SS - M * SS - tot_w * SS
        cy = y + 15 * SS
        for i in range(1, total + 1):
            fill = dot if i == index else (col if ask else "#3A3A3A")
            d.ellipse([x, cy - r * SS, x + r * 2 * SS, cy + r * SS], fill=fill)
            x += gapd * SS


# ── 카드 렌더 ───────────────────────────────────────────────────────────
def base(t, ask=False):
    im = Image.new("RGB", (W * SS, H * SS), t["accent"] if ask else t["bg"])
    if not ask:
        im = glow(im, t["accent"], W * SS * 0.92, H * SS * 1.02, W * SS * 0.75)
    return im


def render_cover(t, title_lines, fnt, lh, total):
    im = base(t)
    d = ImageDraw.Draw(im)
    ring(d, (M + 38) * SS, (M + 38) * SS, 34 * SS, 9 * SS, t["accent"])

    block_h = len(title_lines) * lh
    y = H * SS - (M + 150) * SS - block_h            # 아래쪽에 붙인다
    d.rectangle([M * SS, y - 62 * SS, (M + 116) * SS, y - 52 * SS],
                fill=t["accent"])                     # 제목 위 주황 룰
    for ln in title_lines:
        d.text((M * SS, y), ln, font=fnt, fill=t["fg"])
        y += lh
    footer(d, t, 1, total)
    return im


def render_list(t, items, fnt, lh, index, total):
    """items: [(번호, [줄1, 줄2...])] — 항목이 길면 아래로 흘리고 번호 자리에 맞춰 들여쓴다."""
    im = base(t)
    d = ImageDraw.Draw(im)
    num_f = F(BOLD, fnt.size / SS * 0.92)
    gutter = 78 * SS
    line_h = lh * 0.62                                # 항목 내부 줄 간격
    total_h = sum(lh if len(ls) == 1 else lh + (len(ls) - 1) * line_h
                  for _, ls in items)
    y = H * SS / 2 - total_h / 2
    hair = "#1E1E1E" if t["bg"] == "#0B0B0B" else "#E2DACB"
    for k, (num, lines) in enumerate(items):
        if k:                                        # 항목 사이 머리카락 선
            d.rectangle([M * SS, y - lh * 0.30, (W - M) * SS, y - lh * 0.30 + SS],
                        fill=hair)
        d.text((M * SS, y), num, font=num_f, fill=t["accent"])
        for j, ln in enumerate(lines):
            d.text((M * SS + gutter, y + j * line_h), ln, font=fnt, fill=t["fg"])
        y += lh if len(lines) == 1 else lh + (len(lines) - 1) * line_h
    footer(d, t, index, total)
    return im


def render_para(t, lines, fnt, lh, index, total):
    im = base(t)
    block_h = len(lines) * lh
    y = H * SS / 2 - block_h / 2

    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))    # 큰 따옴표를 배경에 옅게
    r_, g_, b_ = tuple(int(t["accent"][i:i + 2], 16) for i in (1, 3, 5))
    ImageDraw.Draw(ov).text((M * SS - 14 * SS, y - 150 * SS), "“",
                            font=F(BOLD, 260), fill=(r_, g_, b_, 38))
    im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")

    d = ImageDraw.Draw(im)
    d.rectangle([M * SS, y + 6 * SS, (M + 9) * SS, y + block_h - 10 * SS],
                fill=t["accent"])                     # 왼쪽 주황 바
    for ln in lines:
        d.text((M * SS + 46 * SS, y), ln, font=fnt, fill=t["fg"])
        y += lh
    footer(d, t, index, total)
    return im


def render_ask(t, lines, fnt, lh, index, total):
    im = base(t, ask=True)
    d = ImageDraw.Draw(im)
    block_h = len(lines) * lh
    y = H * SS / 2 - block_h / 2 - 40 * SS
    for ln in lines:
        d.text((M * SS, y), ln, font=fnt, fill=t["askfg"])
        y += lh
    hint_f = F(BOLD, 38)
    hy = y + 60 * SS
    d.rounded_rectangle([M * SS, hy, M * SS + d.textlength("댓글로 알려줘", font=hint_f)
                         + 58 * SS, hy + 74 * SS], radius=37 * SS,
                        fill=t["askfg"])
    d.text((M * SS + 29 * SS, hy + 16 * SS), "댓글로 알려줘",
           font=hint_f, fill=t["accent"])
    footer(d, t, index, total, ask=True)
    return im


# ── 원고 분해 ───────────────────────────────────────────────────────────
def split_blocks(text):
    paras = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    out = []
    for p in paras:
        numbered = [l for l in p.split("\n") if re.match(r"^\s*\d+[.)]\s", l)]
        if len(numbered) >= 3:
            head = [l for l in p.split("\n") if l not in numbered]
            if head:
                out.append(("head", "\n".join(head).strip()))
            if len(numbered) <= 8:
                out.append(("list", "\n".join(l.strip() for l in numbered)))
            else:
                h = (len(numbered) + 1) // 2
                out.append(("list", "\n".join(l.strip() for l in numbered[:h])))
                out.append(("list", "\n".join(l.strip() for l in numbered[h:])))
        else:
            out.append(("para", p))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--style", default="dark", choices=list(THEMES))
    ap.add_argument("--max", type=int, default=3, help="카드 최대 장수 (기본 3)")
    a = ap.parse_args()
    t = THEMES[a.style]

    path = a.src if os.path.isabs(a.src) else os.path.join(ROOT, a.src)
    raw = open(path, encoding="utf-8").read().replace("\ufeff", "")
    name = os.path.splitext(os.path.basename(path))[0]
    # 폴더 이름은 앞 숫자만 쓴다 — raw 주소에 한글이 들어가면 인코딩이 지저분해진다
    m = re.match(r"^(\d+)", name)
    outdir = os.path.join(ROOT, "images", m.group(1) if m else name)
    os.makedirs(outdir, exist_ok=True)

    blocks = split_blocks(raw)
    title = blocks[0][1].split("\n")[0]
    rest = blocks[1:] if blocks[0][0] in ("head", "para") else blocks

    def mergeable(b):
        return b[0] in ("para", "head") and not b[1].rstrip().endswith("?")

    while 1 + len(rest) > a.max:
        i = next((i for i in range(len(rest) - 1)
                  if mergeable(rest[i]) and mergeable(rest[i + 1])), None)
        if i is None:
            break
        rest[i] = (rest[i][0], rest[i][1] + "\n\n" + rest[i + 1][1])
        del rest[i + 1]

    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    MAXW = (W - M * 2) * SS
    plan = []

    # 표지 제목은 카드를 꽉 채우도록 크기를 자동으로 올린다 (최대 3줄)
    size = 132
    while size > 64:
        f = F(BOLD, size)
        lines = wrap(probe, title, f, MAXW)
        if len(lines) <= 3:
            break
        size -= 6
    plan.append(("cover", lines, f, int(size * 1.26) * SS))

    for kind, text in rest:
        if kind == "list":
            rows = text.split("\n")
            size = 60 if len(rows) <= 5 else (52 if len(rows) <= 7 else 45)
            f = F(BOLD, size)
            items = []
            for r in rows:
                m = re.match(r"^\s*(\d+)[.)]\s*(.*)$", r)
                num, body = (m.group(1) + ".", m.group(2)) if m else ("", r)
                items.append((num, wrap(probe, body, f, MAXW - 78 * SS)))
            plan.append(("list", items, f, int(size * 1.85) * SS))
        else:
            kind = "ask" if text.rstrip().endswith("?") else "para"
            size = 72 if kind == "ask" else 58        # 질문은 펀치라인이라 크게
            f = F(BOLD, size)
            inset = 0 if kind == "ask" else 46 * SS
            lines = []
            for ln in text.split("\n"):
                lines += wrap(probe, ln, f, MAXW - inset) if ln.strip() else [""]
            plan.append((kind, lines, f, int(size * 1.42) * SS))

    total = len(plan)
    for i, (kind, body, f, lh) in enumerate(plan, 1):
        if kind == "cover":
            im = render_cover(t, body, f, lh, total)
        elif kind == "list":
            im = render_list(t, body, f, lh, i, total)
        elif kind == "ask":
            im = render_ask(t, body, f, lh, i, total)
        else:
            im = render_para(t, body, f, lh, i, total)
        im.resize((W, H), Image.LANCZOS).save(
            os.path.join(outdir, f"{i:02d}.jpg"), quality=93)
        print(f"  {i:02d}.jpg  [{kind}]")

    print(f"\n카드 {total}장 -> {outdir}")


if __name__ == "__main__":
    main()
