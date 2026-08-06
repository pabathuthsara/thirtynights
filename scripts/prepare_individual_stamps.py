"""Normalize individual transparent stamp renders into Expo-ready PNG assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def normalized_stamp(source: Image.Image, size: int, target_span: int) -> Image.Image:
    """Center the visible alpha silhouette with a consistent longest-edge span."""
    rgba = source.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Stamp source has no visible pixels")

    item = rgba.crop(bounds)
    scale = target_span / max(item.size)
    resized = item.resize(
        (max(1, round(item.width * scale)), max(1, round(item.height * scale))),
        Image.Resampling.LANCZOS,
    )
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.alpha_composite(
        resized,
        ((size - resized.width) // 2, (size - resized.height) // 2),
    )
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--first-stamp", required=True)
    parser.add_argument("--preview")
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--target-span", type=int, default=188)
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    first = Image.open(args.first_stamp).convert("RGBA")
    if first.size != (args.size, args.size):
        raise ValueError(f"First stamp must be {args.size}x{args.size}, got {first.size}")
    first.save(output_dir / "completed-01.png", optimize=True)

    stamps = [first]
    for night in range(2, 31):
        source_path = input_dir / f"stamp-{night:02d}-alpha.png"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        stamp = normalized_stamp(Image.open(source_path), args.size, args.target_span)
        stamp.save(output_dir / f"completed-{night:02d}.png", optimize=True)
        stamps.append(stamp)

    if args.preview:
        preview = Image.new(
            "RGBA",
            (args.size * 6, args.size * 5),
            (246, 238, 228, 255),
        )
        for index, stamp in enumerate(stamps):
            preview.alpha_composite(
                stamp,
                ((index % 6) * args.size, (index // 6) * args.size),
            )
        preview.convert("RGB").save(args.preview, quality=94, optimize=True)

    print(f"Wrote 30 normalized stamps to {output_dir}")


if __name__ == "__main__":
    main()
