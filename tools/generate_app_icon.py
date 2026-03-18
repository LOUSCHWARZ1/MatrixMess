from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "ios" / "MatrixMess" / "Sources" / "App" / "Assets.xcassets" / "AppIcon.appiconset"
MASTER_SIZE = 1024


ICON_OUTPUTS = {
    "Icon-20.png": 20,
    "Icon-29.png": 29,
    "Icon-40.png": 40,
    "Icon-40-ipad.png": 40,
    "Icon-40-notification.png": 40,
    "Icon-58.png": 58,
    "Icon-58-iphone.png": 58,
    "Icon-60-notification.png": 60,
    "Icon-76.png": 76,
    "Icon-80.png": 80,
    "Icon-80-iphone.png": 80,
    "Icon-87.png": 87,
    "Icon-120.png": 120,
    "Icon-120-app.png": 120,
    "Icon-152.png": 152,
    "Icon-167.png": 167,
    "Icon-180.png": 180,
    "Icon-1024.png": 1024,
}


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def radial_gradient(size: int, center: tuple[float, float], radius: float, inner: tuple[int, int, int, int], outer: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (size, size), outer)
    pixels = layer.load()
    cx, cy = center
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            t = min(1.0, dist / radius)
            t = t * t * (3.0 - 2.0 * t)
            pixels[x, y] = tuple(int(lerp(inner[i], outer[i], t)) for i in range(4))
    return layer


def linear_gradient(size: int, start: tuple[int, int, int], end: tuple[int, int, int], vertical: bool = True) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (y if vertical else x) / max(1, size - 1)
            rgb = mix(start, end, t)
            pixels[x, y] = (*rgb, 255)
    return image


def bubble_mask(size: int, bbox: tuple[int, int, int, int], tail: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(bbox, fill=255)
    draw.polygon(tail, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(1.4))


def rounded_rect_mask(size: int, bbox: tuple[int, int, int, int], radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(bbox, radius=radius, fill=255)
    return mask


def draw_shadow(base: Image.Image, mask: Image.Image, color: tuple[int, int, int, int], blur: int, offset: tuple[int, int] = (0, 0)) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    alpha = mask.filter(ImageFilter.GaussianBlur(blur))
    colored = Image.new("RGBA", base.size, color)
    colored.putalpha(alpha)
    shifted = ImageChops.offset(colored, offset[0], offset[1])
    base.alpha_composite(shifted)


def paint_bubble(
    base: Image.Image,
    bbox: tuple[int, int, int, int],
    tail: list[tuple[int, int]],
    start: tuple[int, int, int],
    end: tuple[int, int, int],
    stroke: tuple[int, int, int],
    glow: tuple[int, int, int, int],
    dots: list[tuple[int, int, int]],
) -> None:
    mask = bubble_mask(base.size[0], bbox, tail)

    fill = linear_gradient(base.size[0], start, end, vertical=True)
    fill.putalpha(mask)
    base.alpha_composite(fill)

    inner_highlight = radial_gradient(base.size[0], (bbox[0] + 150, bbox[1] + 70), 240, (255, 255, 255, 165), (255, 255, 255, 0))
    inner_highlight.putalpha(mask)
    base.alpha_composite(inner_highlight)

    draw_shadow(base, mask, glow, blur=22)

    outline_draw = ImageDraw.Draw(base)
    outline_draw.ellipse(bbox, outline=stroke, width=8)
    outline_draw.line([tail[0], tail[1], tail[2], tail[0]], fill=stroke, width=8, joint="curve")

    inner_box = (bbox[0] + 12, bbox[1] + 12, bbox[2] - 12, bbox[3] - 12)
    outline_draw.ellipse(inner_box, outline=(255, 255, 255, 88), width=4)

    for cx, cy, r in dots:
        outline_draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 245), outline=(240, 240, 240, 255), width=2)


def build_master_icon() -> Image.Image:
    size = MASTER_SIZE
    canvas = Image.new("RGBA", (size, size), (31, 34, 39, 255))

    canvas.alpha_composite(radial_gradient(size, (230, 210), 420, (120, 70, 82, 78), (0, 0, 0, 0)))
    canvas.alpha_composite(radial_gradient(size, (760, 230), 360, (75, 126, 87, 82), (0, 0, 0, 0)))
    canvas.alpha_composite(radial_gradient(size, (540, 620), 620, (22, 28, 36, 90), (0, 0, 0, 0)))

    panel = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_box = (134, 126, 854, 902)
    panel_draw.rounded_rectangle(panel_box, radius=132, fill=(18, 24, 30, 252), outline=(7, 11, 16, 255), width=4)
    panel.alpha_composite(radial_gradient(size, (520, 286), 540, (58, 78, 89, 62), (0, 0, 0, 0)))
    draw_shadow(canvas, rounded_rect_mask(size, panel_box, 132), (0, 0, 0, 95), blur=32, offset=(0, 22))
    canvas.alpha_composite(panel)

    green_bbox = (430, 255, 815, 635)
    green_tail = [(665, 607), (754, 619), (741, 714)]
    paint_bubble(
        canvas,
        green_bbox,
        green_tail,
        start=(161, 255, 121),
        end=(5, 156, 30),
        stroke=(90, 255, 112),
        glow=(60, 255, 84, 95),
        dots=[(628, 412, 27), (698, 412, 27)],
    )

    red_bbox = (238, 356, 674, 658)
    red_tail = [(320, 650), (278, 692), (286, 786)]
    paint_bubble(
        canvas,
        red_bbox,
        red_tail,
        start=(255, 123, 169),
        end=(245, 0, 74),
        stroke=(255, 101, 136),
        glow=(255, 17, 89, 118),
        dots=[(359, 508, 26), (424, 508, 26), (489, 508, 26)],
    )

    spec = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    spec_draw = ImageDraw.Draw(spec)
    spec_draw.rounded_rectangle((152, 144, 836, 888), radius=128, outline=(255, 255, 255, 10), width=2)
    canvas.alpha_composite(spec)

    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = build_master_icon()
    for filename, icon_size in ICON_OUTPUTS.items():
        resized = master.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        resized.save(OUTPUT / filename)
    print(f"Generated {len(ICON_OUTPUTS)} app icon files in {OUTPUT}")


if __name__ == "__main__":
    main()
