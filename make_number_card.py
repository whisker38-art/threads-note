# -*- coding: utf-8 -*-
"""37번 글 전용 숫자 강조 카드. make_cards.py의 톤(검정+주황 링)을 그대로 쓰되
02.jpg 자리에 큰 숫자 히어로 카드를 만들어 끼운다.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H, SS = 1080, 1350, 2
M = 96
BOLD = r"C:\Windows\Fonts\malgunbd.ttf"
REG = r"C:\Windows\Fonts\malgun.ttf"
ROOT = os.path.dirname(os.path.abspath(__file__))
HANDLE = "@daily_note2021"
BG, FG, ACCENT, SUB = "#0B0B0B", "#FFFFFF", "#FF6B1A", "#6E6E6E"


def F(path, size):
    return ImageFont.truetype(path, int(size * SS))


def glow(im, color, cx, cy, radius, strength=26):
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
    d.arc([cx - r, cy - r, cx + r, cy + r], start=gap_start, end=gap_end,
          fill=color, width=int(w))


def center_text(d, text, font, cy, fill):
    w = d.textlength(text, font=font)
    d.text(((W * SS - w) / 2, cy), text, font=font, fill=fill)


def footer(d, index, total):
    y = (H - 92) * SS
    d.ellipse([M * SS, y + 9 * SS, (M + 11) * SS, y + 20 * SS], fill=ACCENT)
    d.text(((M + 26) * SS, y), HANDLE, font=F(REG, 29), fill=SUB)
    r, gapd = 7, 24
    tot_w = total * r * 2 + (total - 1) * (gapd - r * 2)
    x = W * SS - M * SS - tot_w * SS
    cy = y + 15 * SS
    for i in range(1, total + 1):
        fill = ACCENT if i == index else "#3A3A3A"
        d.ellipse([x, cy - r * SS, x + r * 2 * SS, cy + r * SS], fill=fill)
        x += gapd * SS


def main():
    im = Image.new("RGB", (W * SS, H * SS), BG)
    im = glow(im, ACCENT, W * SS * 0.92, H * SS * 1.02, W * SS * 0.75)
    d = ImageDraw.Draw(im)
    ring(d, (M + 38) * SS, (M + 38) * SS, 34 * SS, 9 * SS, ACCENT)

    label_f = F(BOLD, 40)
    center_text(d, "조건 없이 받는 1년 정기예금", label_f, 300 * SS, SUB)

    num_f = F(BOLD, 230)
    center_text(d, "3.81%", num_f, 430 * SS, ACCENT)

    sub_f = F(BOLD, 44)
    center_text(d, "전북은행 JB다이렉트예금", sub_f, 730 * SS, FG)

    line_f = F(REG, 34)
    center_text(d, "국민·신한 기본금리는 2.3~2.55%", line_f, 820 * SS, SUB)

    box_f = F(BOLD, 32)
    txt = "1천만원 넣으면 세후 약 32만2천원"
    tw = d.textlength(txt, font=box_f)
    bx0 = (W * SS - tw) / 2 - 40 * SS
    bx1 = (W * SS + tw) / 2 + 40 * SS
    by0, by1 = 910 * SS, 980 * SS
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=35 * SS, outline=ACCENT, width=int(3 * SS))
    d.text(((W * SS - tw) / 2, by0 + 18 * SS), txt, font=box_f, fill=FG)

    footer(d, 2, 3)
    outdir = os.path.join(ROOT, "images", "37")
    os.makedirs(outdir, exist_ok=True)
    im.resize((W, H), Image.LANCZOS).save(os.path.join(outdir, "02.jpg"), quality=93)
    print("saved", os.path.join(outdir, "02.jpg"))


if __name__ == "__main__":
    main()
