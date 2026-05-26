#!/usr/bin/env python3
"""Generate icon PNG sizes from RoofyMusicIcon.png source."""

import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SCRIPT_DIR, '..')
ICONS_DIR = os.path.join(ROOT, 'assets', 'icons')
SOURCE_PATH = os.path.join(ROOT, 'assets', 'RoofyMusicIcon.png')

SIZES = [16, 24, 32, 48, 64, 72, 96, 128, 256, 512, 1024]


def make_template_icon(img: Image.Image, size: int) -> Image.Image:
    """Convert white-on-black icon to black-silhouette on transparent."""
    img = img.convert('RGBA').resize((size, size), Image.LANCZOS)
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # If pixel is bright (white text), make it black
            if r > 128 and g > 128 and b > 128:
                pixels[x, y] = (0, 0, 0, 255)
            else:
                # Dark pixels become transparent
                pixels[x, y] = (0, 0, 0, 0)
    return img


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)

    source = Image.open(SOURCE_PATH)
    print(f"Source: {source.size[0]}x{source.size[1]}px")

    # Generate sized PNGs
    for size in SIZES:
        resized = source.resize((size, size), Image.LANCZOS)
        path = os.path.join(ICONS_DIR, f"{size}x{size}.png")
        resized.save(path, 'PNG')
        print(f"  {size}x{size}.png")

    # Main icon.png (256x256)
    icon_path = os.path.join(ICONS_DIR, 'icon.png')
    source.resize((256, 256), Image.LANCZOS).save(icon_path, 'PNG')
    print(f"  icon.png (256x256)")

    # macOS template icons (transparent black silhouette)
    template_16 = make_template_icon(source, 16)
    template_32 = make_template_icon(source, 32)
    template_16.save(os.path.join(ICONS_DIR, 'IconTemplate.png'), 'PNG')
    template_32.save(os.path.join(ICONS_DIR, 'IconTemplate@2x.png'), 'PNG')
    print(f"  IconTemplate.png / IconTemplate@2x.png")

    print("Done!")


if __name__ == '__main__':
    main()
