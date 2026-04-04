#!/usr/bin/env python3
"""
テキスト/PDF → 美しいプレゼン用PDF変換スクリプト
使い方:
  python3 text_to_presentation.py <入力ファイル> [出力ファイル]

対応入力形式: .pdf, .txt, .md
"""

import sys
import os
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── 定数 ──────────────────────────────────────────────────────────────────
W, H = 297 * mm, 210 * mm   # A4横向き (landscape)

# カラーパレット（モダンダーク）
BG_DARK    = colors.HexColor("#1A1A2E")
BG_ACCENT  = colors.HexColor("#16213E")
ACCENT1    = colors.HexColor("#0F3460")
ACCENT2    = colors.HexColor("#E94560")
TEXT_WHITE = colors.HexColor("#EAEAEA")
TEXT_GRAY  = colors.HexColor("#A8A8B3")
DIVIDER    = colors.HexColor("#E94560")

FONT_PATH_GOTHIC = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

# ─── フォント登録 ────────────────────────────────────────────────────────────
def register_fonts():
    pdfmetrics.registerFont(TTFont("IPAGothic", FONT_PATH_GOTHIC))

# ─── 入力ファイル読み込み ────────────────────────────────────────────────────
def read_input(filepath: str) -> str:
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".pdf":
        import fitz  # PyMuPDF
        doc = fitz.open(filepath)
        texts = []
        for page in doc:
            texts.append(page.get_text())
        return "\n".join(texts)
    else:
        with open(filepath, encoding="utf-8") as f:
            return f.read()

# ─── テキスト → スライドデータに変換 ─────────────────────────────────────────
def parse_slides(text: str) -> list[dict]:
    """
    Markdownライクなルール:
      # タイトル  → タイトルスライド
      ## 見出し   → セクションスライド
      それ以外     → 直前スライドのbulletに追加
    """
    lines = text.splitlines()
    slides = []
    current = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("# "):
            # タイトルスライド
            current = {"type": "title", "title": line[2:].strip(), "subtitle": ""}
            slides.append(current)
        elif line.startswith("## "):
            current = {"type": "section", "title": line[3:].strip(), "bullets": []}
            slides.append(current)
        elif line.startswith("### "):
            # サブ見出し → bulletとして扱う
            if current and current["type"] == "section":
                current["bullets"].append(("sub", line[4:].strip()))
            else:
                current = {"type": "section", "title": line[4:].strip(), "bullets": []}
                slides.append(current)
        else:
            if current is None:
                # 先頭の見出しなしテキスト → タイトルスライドを自動生成
                current = {"type": "title", "title": "プレゼンテーション", "subtitle": line}
                slides.append(current)
            elif current["type"] == "title":
                if not current["subtitle"]:
                    current["subtitle"] = line
            elif current["type"] == "section":
                # "- " や "* " を除去してbulletに追加
                bullet_text = re.sub(r"^[-*•]\s*", "", line)
                current["bullets"].append(("bullet", bullet_text))

    if not slides:
        slides.append({"type": "title", "title": "プレゼンテーション", "subtitle": text[:80]})

    return slides

# ─── 描画ヘルパー ────────────────────────────────────────────────────────────
def draw_background(c: canvas.Canvas, slide_type: str):
    """スライド背景を描画"""
    c.setFillColor(BG_DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    if slide_type == "title":
        # 右側にアクセント矩形
        c.setFillColor(ACCENT1)
        c.rect(W * 0.55, 0, W * 0.45, H, fill=1, stroke=0)
        # 斜めのアクセント
        c.setFillColor(ACCENT2)
        p = c.beginPath()
        p.moveTo(W * 0.52, 0)
        p.lineTo(W * 0.58, 0)
        p.lineTo(W * 0.55, H)
        p.lineTo(W * 0.49, H)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    else:
        # ヘッダーバー
        c.setFillColor(ACCENT1)
        c.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
        # 左アクセントライン
        c.setFillColor(ACCENT2)
        c.rect(0, 0, 4 * mm, H, fill=1, stroke=0)

def draw_slide_number(c: canvas.Canvas, num: int, total: int):
    c.setFont("IPAGothic", 9)
    c.setFillColor(TEXT_GRAY)
    c.drawRightString(W - 10 * mm, 7 * mm, f"{num} / {total}")

def draw_footer_line(c: canvas.Canvas):
    c.setStrokeColor(ACCENT2)
    c.setLineWidth(0.5)
    c.line(10 * mm, 14 * mm, W - 10 * mm, 14 * mm)

def wrap_text(text: str, font: str, size: float, max_width: float, c: canvas.Canvas) -> list[str]:
    """簡易テキスト折り返し"""
    words = list(text)  # 日本語は1文字ずつ
    lines = []
    current_line = ""
    for ch in text:
        test = current_line + ch
        if c.stringWidth(test, font, size) > max_width:
            if current_line:
                lines.append(current_line)
            current_line = ch
        else:
            current_line = test
    if current_line:
        lines.append(current_line)
    return lines if lines else [text]

# ─── スライド描画 ────────────────────────────────────────────────────────────
def draw_title_slide(c: canvas.Canvas, slide: dict, num: int, total: int):
    draw_background(c, "title")

    title = slide["title"]
    subtitle = slide.get("subtitle", "")

    # タイトルテキスト（左側）
    text_area_w = W * 0.48 - 20 * mm
    left_x = 20 * mm

    # タイトル
    title_lines = wrap_text(title, "IPAGothic", 32, text_area_w, c)
    title_y = H / 2 + len(title_lines) * 18 * mm / 2

    c.setFillColor(ACCENT2)
    c.setFont("IPAGothic", 12)
    c.drawString(left_x, title_y + 14 * mm, "PRESENTATION")

    c.setFillColor(TEXT_WHITE)
    c.setFont("IPAGothic", 32)
    y = title_y
    for line in title_lines:
        c.drawString(left_x, y, line)
        y -= 14 * mm

    # 区切り線
    c.setStrokeColor(ACCENT2)
    c.setLineWidth(2)
    c.line(left_x, y - 4 * mm, left_x + 60 * mm, y - 4 * mm)

    # サブタイトル
    if subtitle:
        c.setFillColor(TEXT_GRAY)
        c.setFont("IPAGothic", 14)
        sub_lines = wrap_text(subtitle, "IPAGothic", 14, text_area_w, c)
        sy = y - 12 * mm
        for sl in sub_lines[:3]:
            c.drawString(left_x, sy, sl)
            sy -= 8 * mm

    # 右側デコレーション（アイコン風）
    cx_r = W * 0.77
    cy_r = H / 2
    c.setFillColor(colors.HexColor("#FFFFFF22"))
    c.circle(cx_r, cy_r, 50 * mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#FFFFFF11"))
    c.circle(cx_r - 20 * mm, cy_r + 20 * mm, 30 * mm, fill=1, stroke=0)

    draw_slide_number(c, num, total)


def draw_section_slide(c: canvas.Canvas, slide: dict, num: int, total: int):
    draw_background(c, "section")
    draw_footer_line(c)

    title = slide["title"]
    bullets = slide.get("bullets", [])

    # ヘッダータイトル
    c.setFillColor(TEXT_WHITE)
    c.setFont("IPAGothic", 22)
    c.drawString(12 * mm, H - 15 * mm, title)

    # アクセントドット
    c.setFillColor(ACCENT2)
    c.circle(9 * mm, H - 12 * mm, 2.5 * mm, fill=1, stroke=0)

    # bullet リスト
    content_w = W - 30 * mm
    y = H - 38 * mm
    line_h_bullet = 10 * mm
    line_h_sub = 8 * mm

    for btype, btext in bullets:
        if y < 20 * mm:
            break

        if btype == "sub":
            # サブ項目
            c.setFillColor(TEXT_GRAY)
            c.setFont("IPAGothic", 12)
            indent = 25 * mm
            lines = wrap_text(btext, "IPAGothic", 12, content_w - indent, c)
            for i, line in enumerate(lines[:2]):
                c.drawString(indent, y, line)
                y -= line_h_sub
            y -= 1 * mm
        else:
            # メイン bullet
            c.setFillColor(ACCENT2)
            c.setFont("IPAGothic", 16)
            c.drawString(10 * mm, y, "▶")

            c.setFillColor(TEXT_WHITE)
            c.setFont("IPAGothic", 15)
            lines = wrap_text(btext, "IPAGothic", 15, content_w - 10 * mm, c)
            first = True
            for line in lines[:3]:
                c.drawString(20 * mm, y, line)
                if first:
                    y -= line_h_bullet
                    first = False
                else:
                    y -= line_h_sub
            y -= 2 * mm

    draw_slide_number(c, num, total)


# ─── メイン ──────────────────────────────────────────────────────────────────
def generate_presentation(input_path: str, output_path: str):
    register_fonts()

    print(f"読み込み中: {input_path}")
    text = read_input(input_path)

    print("スライドを解析中...")
    slides = parse_slides(text)
    total = len(slides)
    print(f"  → {total} スライドを生成します")

    c = canvas.Canvas(output_path, pagesize=(W, H))
    c.setTitle(os.path.splitext(os.path.basename(input_path))[0])

    for i, slide in enumerate(slides, 1):
        if slide["type"] == "title":
            draw_title_slide(c, slide, i, total)
        else:
            draw_section_slide(c, slide, i, total)
        c.showPage()

    c.save()
    print(f"完成: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使い方: python3 text_to_presentation.py <入力ファイル> [出力.pdf]")
        sys.exit(1)

    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(inp)[0] + "_presentation.pdf"
    generate_presentation(inp, out)
