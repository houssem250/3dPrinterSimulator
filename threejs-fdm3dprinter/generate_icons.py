from PIL import Image, ImageDraw

def draw_icon():
    # Size 512x512
    size = 512
    # Create solid base with Slate-900 background
    image = Image.new("RGBA", (size, size), (15, 23, 42, 255))
    draw = ImageDraw.Draw(image)
    
    # Linear Slate 900 to Slate 800 background gradient
    for y in range(size):
        r = int(15 + (30 - 15) * (y / size))
        g = int(23 + (41 - 23) * (y / size))
        b = int(42 + (59 - 42) * (y / size))
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
        
    # Draw Indigo border with rounded corners
    border_color = (99, 102, 241, 180) # Indigo-500
    draw.rounded_rectangle([16, 16, size-16, size-16], radius=64, outline=border_color, width=8)
    
    # Isometric center
    cx, cy = 256, 330
    
    # Draw isometric build plate (slate-800 with slate-600 outline)
    plate_points = [
        (cx - 160, cy),
        (cx, cy - 80),
        (cx + 160, cy),
        (cx, cy + 80)
    ]
    draw.polygon(plate_points, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255))
    
    # Draw build plate grid lines (parallel to the isometric edges)
    # X-axis grid lines (parallel to top-right edge)
    for offset in range(-120, 160, 40):
        # We start from one side of the diamond and draw to the other
        x1 = cx - 160 + (offset + 120) * 160 // 280
        y1 = cy + (offset + 120) * 80 // 280
        x2 = cx + offset
        y2 = cy - 80 + (offset + 120) * 80 // 280
        # clamp points to the plate boundary coordinates for clean look,
        # but simple lines inside the shape also work:
        draw.line([(cx - 160 + (offset + 160)//2, cy + (offset + 160)//4), (cx + (offset + 160)//2, cy - 80 + (offset + 160)//4)], fill=(51, 65, 85, 255), width=2)
        
    # Let's draw the printed 3D object (a glowing cyan-purple cylinder/sphere stack)
    # representing a printed vase
    h_start = 320
    h_end = 220
    num_layers = 25
    for step in range(num_layers):
        curr_y = h_start - (step * (h_start - h_end) // num_layers)
        
        # Calculate width using a sine wave to make it look like a printed vase/pot
        import math
        t = step / num_layers
        width_mod = math.sin(t * math.pi * 1.5) * 15
        w = int(75 + width_mod)
        h = int(w * 0.45) # Isometric ratio
        
        # Color transitions from magenta/purple to cyan
        r = int(168 - (168 - 6) * t)     # Purple to Cyan
        g = int(85 - (85 - 182) * t)
        b = int(247 - (247 - 212) * t)
        
        # Draw the layers (slightly transparent fill for 3D depth, solid outline)
        draw.ellipse([cx - w, curr_y - h, cx + w, curr_y + h], outline=(r, g, b, 255), width=3)
        if step == num_layers - 1:
            draw.ellipse([cx - w, curr_y - h, cx + w, curr_y + h], fill=(r, g, b, 100), outline=(r, g, b, 255), width=3)
            
    # Draw the extruder hotend
    # Tip of the nozzle sits exactly at the top center of the printed object
    nozzle_tip_y = h_end
    
    # 1. Brass nozzle (gold polygon)
    draw.polygon([
        (cx - 18, nozzle_tip_y - 20),
        (cx + 18, nozzle_tip_y - 20),
        (cx, nozzle_tip_y)
    ], fill=(217, 119, 6, 255), outline=(180, 83, 9, 255))
    
    # 2. Heater Block (slate-500 silver rectangular cube)
    draw.rectangle([cx - 32, nozzle_tip_y - 45, cx + 32, nozzle_tip_y - 20], fill=(148, 163, 184, 255), outline=(71, 85, 105, 255))
    
    # 3. Heating element wire entry (red)
    draw.rectangle([cx - 24, nozzle_tip_y - 40, cx - 18, nozzle_tip_y - 30], fill=(239, 68, 68, 255))
    
    # 4. Extruder heat sink / fan block (dark grey)
    draw.rectangle([cx - 45, nozzle_tip_y - 90, cx + 45, nozzle_tip_y - 45], fill=(71, 85, 105, 255), outline=(30, 41, 59, 255))
    
    # Horizontal cooling fins
    for fin_y in range(nozzle_tip_y - 85, nozzle_tip_y - 45, 10):
        draw.line([(cx - 50, fin_y), (cx + 50, fin_y)], fill=(51, 65, 85, 255), width=3)
        
    # 5. Filament entering the extruder (glowing cyan line)
    draw.line([(cx, nozzle_tip_y - 160), (cx, nozzle_tip_y - 90)], fill=(6, 182, 212, 255), width=4)
    # Filament guide path (angling off to the top-left)
    draw.line([(cx, nozzle_tip_y - 160), (cx - 120, nozzle_tip_y - 220)], fill=(6, 182, 212, 255), width=4)
    
    # 6. Little orange/red glow at the nozzle tip
    draw.ellipse([cx - 5, nozzle_tip_y - 2, cx + 5, nozzle_tip_y + 8], fill=(249, 115, 22, 255))

    # Save to assets
    import os
    os.makedirs("public", exist_ok=True)
    
    # 512x512 images
    image.save("public/pwa-512x512.png", "PNG")
    image.save("public/maskable-icon.png", "PNG")
    
    # 192x192 image
    img_192 = image.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save("public/pwa-192x192.png", "PNG")
    
    # Apple Touch Icon (180x180)
    img_180 = image.resize((180, 180), Image.Resampling.LANCZOS)
    img_180.save("public/apple-touch-icon.png", "PNG")
    
    # Favicon (48x48)
    img_48 = image.resize((48, 48), Image.Resampling.LANCZOS)
    img_48.save("public/favicon.ico", "ICO")
    
    print("All PWA icons generated successfully!")

if __name__ == "__main__":
    draw_icon()
