"""Generate the Android notification icon.

Android draws the small notification icon as a *mask*: every non-transparent
pixel is repainted in the accent colour, so anything with real colour in it
arrives as a flat grey-white blob. The asset therefore has to be a white
silhouette on transparent, sized to the 24dp content box inside a 96x96 canvas.

The mark is the app's own crescent-and-star, drawn as pure alpha so it survives
the mask intact.

Usage: python scripts/make_notification_icon.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

CANVAS = 96
# Android reserves the outer ring; the glyph must live inside the middle 2/3 or
# it gets clipped on devices that apply a circular mask.
CONTENT = 66
OUT = Path(__file__).resolve().parent.parent / "assets" / "app" / "notification-icon.png"


def star(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float) -> None:
    """A four-point sparkle, matching the app's own Sparkle component."""
    points = []
    for index in range(8):
        angle = math.pi / 2 * (index / 2) - math.pi / 2
        reach = radius if index % 2 == 0 else radius * 0.34
        points.append((cx + math.cos(angle) * reach, cy + math.sin(angle) * reach))
    draw.polygon(points, fill=255)


def build() -> Image.Image:
    # Draw at 8x and downsample: PIL has no antialiased vector fill, so
    # supersampling is what keeps the crescent's inner edge smooth.
    scale = 8
    size = CANVAS * scale
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    inset = (CANVAS - CONTENT) / 2 * scale
    box = CONTENT * scale
    cx = inset + box / 2
    cy = inset + box / 2
    outer = box * 0.42

    # Crescent: a filled disc with a second disc punched out of it, offset up
    # and to the right so the horns point the same way as the night-1 sticker.
    draw.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=255)
    bite = outer * 0.86
    bite_cx = cx + outer * 0.40
    bite_cy = cy - outer * 0.24
    draw.ellipse([bite_cx - bite, bite_cy - bite, bite_cx + bite, bite_cy + bite], fill=0)

    star(draw, cx + outer * 0.62, cy + outer * 0.66, outer * 0.30)
    star(draw, cx + outer * 0.98, cy + outer * 0.10, outer * 0.19)

    mask = mask.resize((CANVAS, CANVAS), Image.LANCZOS)
    icon = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 0))
    icon.putalpha(mask)
    # Every visible pixel is pure white; Android recolours by alpha alone.
    white = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 255))
    white.putalpha(mask)
    return white


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT)
    print(f"wrote {OUT}")
