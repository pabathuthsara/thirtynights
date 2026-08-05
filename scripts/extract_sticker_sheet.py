"""Extract an evenly spaced sticker contact sheet into square RGBA assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def alpha_components(image: Image.Image, threshold: int = 18) -> list[tuple[int, int, int, int, int]]:
    """Return connected alpha components as (pixel_count, left, top, right, bottom)."""
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= threshold:
                continue
            stack = [(x, y)]
            visited[index] = 1
            count = 0
            left = right = x
            top = bottom = y
            while stack:
                current_x, current_y = stack.pop()
                count += 1
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] <= threshold:
                        continue
                    visited[next_index] = 1
                    stack.append((next_x, next_y))
            components.append((count, left, top, right + 1, bottom + 1))

    return components


def keep_largest_alpha_component(image: Image.Image, threshold: int = 18) -> Image.Image:
    """Remove slivers from neighboring cells while preserving the main sticker."""
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    largest: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= threshold:
                continue
            stack = [(x, y)]
            visited[index] = 1
            component: list[tuple[int, int]] = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y), (current_x, current_y - 1), (current_x, current_y + 1)):
                    if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] <= threshold:
                        continue
                    visited[next_index] = 1
                    stack.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    keep = Image.new("L", image.size, 0)
    keep_pixels = keep.load()
    for x, y in largest:
        keep_pixels[x, y] = pixels[x, y]
    cleaned = image.copy()
    cleaned.putalpha(keep)
    return cleaned


def padded_square(item: Image.Image, size: int, padding_ratio: float) -> Image.Image:
    """Center an item in a consistently padded transparent square."""
    padding = max(12, round(max(item.size) * padding_ratio))
    square_edge = max(item.size) + padding * 2
    square = Image.new("RGBA", (square_edge, square_edge), (0, 0, 0, 0))
    square.alpha_composite(item, ((square_edge - item.width) // 2, (square_edge - item.height) // 2))
    square.thumbnail((size, size), Image.Resampling.LANCZOS)
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.alpha_composite(square, ((size - square.width) // 2, (size - square.height) // 2))
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--rows", type=int, default=5)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--prefix", default="sticker")
    parser.add_argument("--padding-ratio", type=float, default=0.14)
    parser.add_argument(
        "--detect-components",
        action="store_true",
        help="Detect the 30 stickers from alpha instead of assuming exact cell boundaries.",
    )
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    output_dir = Path(args.out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.detect_components:
        expected = args.rows * args.columns
        detected = sorted(alpha_components(source), reverse=True)[:expected]
        if len(detected) != expected:
            raise RuntimeError(f"Expected {expected} sticker components, found {len(detected)}")
        row_major: list[tuple[int, int, int, int, int]] = []
        detected.sort(key=lambda component: (component[2] + component[4]) / 2)
        for row in range(args.rows):
            group = detected[row * args.columns:(row + 1) * args.columns]
            group.sort(key=lambda component: (component[1] + component[3]) / 2)
            row_major.extend(group)

        for index, (_, left, top, right, bottom) in enumerate(row_major, start=1):
            item = source.crop((left, top, right, bottom))
            padded_square(item, args.size, args.padding_ratio).save(
                output_dir / f"{args.prefix}-{index:02d}.png",
                optimize=True,
            )
        return

    for row in range(args.rows):
        top = round(row * source.height / args.rows)
        bottom = round((row + 1) * source.height / args.rows)
        for column in range(args.columns):
            left = round(column * source.width / args.columns)
            right = round((column + 1) * source.width / args.columns)
            cell = keep_largest_alpha_component(source.crop((left, top, right, bottom)))
            alpha = cell.getchannel("A")
            bounds = alpha.getbbox()
            if bounds is None:
                raise RuntimeError(f"Cell {row + 1},{column + 1} has no visible pixels")
            item = cell.crop(bounds)
            final = padded_square(item, args.size, args.padding_ratio)
            index = row * args.columns + column + 1
            final.save(output_dir / f"{args.prefix}-{index:02d}.png", optimize=True)


if __name__ == "__main__":
    main()
