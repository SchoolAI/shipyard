#!/usr/bin/env python3
"""
Generate all required icon sizes from a source image.

Usage:
    python scripts/generate-icons.py path/to/source-icon.png

Outputs to apps/web/public/:
    - favicon.ico (16x16, 32x32, 48x48)
    - icon-192.png (192x192)
    - icon-512.png (512x512)
    - apple-touch-icon.png (180x180)
"""

import sys
from pathlib import Path
from PIL import Image

def resize_with_padding(image: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    """Resize image to fit in target size, adding padding if needed to maintain aspect ratio."""
    # Calculate scaling to fit within target
    img_ratio = image.width / image.height
    target_ratio = target_size[0] / target_size[1]

    if img_ratio > target_ratio:
        # Image is wider - scale to width
        new_width = target_size[0]
        new_height = int(target_size[0] / img_ratio)
    else:
        # Image is taller - scale to height
        new_height = target_size[1]
        new_width = int(target_size[1] * img_ratio)

    # Resize maintaining aspect ratio
    resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Create new image with padding (transparent)
    result = Image.new('RGBA', target_size, (0, 0, 0, 0))

    # Center the resized image
    paste_x = (target_size[0] - new_width) // 2
    paste_y = (target_size[1] - new_height) // 2
    result.paste(resized, (paste_x, paste_y))

    return result

def generate_icons(source_path: str, output_dir: str):
    """Generate all icon sizes from source image."""
    source = Path(source_path)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    # Load source image
    print(f"Loading {source}...")
    img = Image.open(source)

    # Ensure RGBA mode for transparency
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # Icon sizes to generate
    sizes = {
        'icon-192.png': (192, 192),
        'icon-512.png': (512, 512),
        'apple-touch-icon.png': (180, 180),
    }

    for filename, size in sizes.items():
        print(f"Generating {filename} ({size[0]}x{size[1]})...")
        resized = resize_with_padding(img, size)
        resized.save(output / filename, 'PNG', optimize=True)

    # Generate multi-size favicon.ico
    print("Generating favicon.ico (16x16, 32x32, 48x48)...")
    favicon_sizes = [(16, 16), (32, 32), (48, 48)]
    favicon_images = [resize_with_padding(img, size) for size in favicon_sizes]

    # Save as ICO with multiple sizes
    favicon_images[0].save(
        output / 'favicon.ico',
        format='ICO',
        sizes=[(im.width, im.height) for im in favicon_images],
        append_images=favicon_images[1:],
    )

    print(f"\n✅ Generated {len(sizes) + 1} icon files in {output}")
    print("\nFiles created:")
    for f in sorted(output.glob('*.png')) + list(output.glob('*.ico')):
        if f.name not in ['icon.svg', 'og-image.png']:
            size_kb = f.stat().st_size / 1024
            print(f"  - {f.name:30s} {size_kb:>6.1f} KB")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scripts/generate-icons.py path/to/source-icon.png")
        sys.exit(1)

    source_path = sys.argv[1]
    output_dir = 'apps/web/public'

    generate_icons(source_path, output_dir)
