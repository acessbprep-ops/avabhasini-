/**
 * Avabhasini Clinical Image Enhancement Pipeline (Layer 3)
 * Provides advanced client-side hardware-accelerated and canvas image filters
 * to equalize contrast, perform Gray World white balance correction, sharpen details,
 * and upscale low-megapixel inputs for standardized accurate diagnostic classification.
 */

export interface ImageQualityMetrics {
  width: number;
  height: number;
  megapixels: number;
  brightness: number;  // 0 - 255
  sharpness: number;   // Variance gradient score (Laplacian approximation)
  exposureStatus: 'dark' | 'bright' | 'good';
  sharpnessStatus: 'blurry' | 'sharp';
  rednessScale?: number;
  whitenessScale?: number;
  darknessScale?: number;
  copperyScale?: number;
}

/**
 * Loads a base64 image data URL into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image element for processing'));
    img.src = src;
  });
}

/**
 * Calculates brightness and gradient-based sharpness (approx. Laplacian variance) in real-time
 */
export async function analyzeImageQualityMetrics(dataUrl: string): Promise<ImageQualityMetrics> {
  const img = await loadImage(dataUrl);
  
  // Create offscreen canvas for analysis
  const canvas = document.createElement('canvas');
  const maxDim = 300; // Small size for fast parsing
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context could not be acquired');
  }
  
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  // 1. Calculate Average Brightness and color distributions
  let totalLuminance = 0;
  const numPixels = w * h;
  let redPixels = 0;
  let whitePixels = 0;
  let darkPixels = 0;
  let copperyPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Standard relative luminance formula
    totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;

    // Redness: Significant Red component compared to Green and Blue
    if (r > 1.25 * g && r > 1.25 * b && r > 70) {
      redPixels++;
    }
    // Whiteness/Pale scale: High values, relatively balanced (scales, pale, Shvaitya patches)
    if (r > 165 && g > 165 && b > 160 && Math.abs(r - g) < 25 && Math.abs(r - b) < 25) {
      whitePixels++;
    }
    // Darkness/Dusky scale: low luminance, or dusky blackish-brown
    if (r < 95 && g < 85 && b < 85) {
      darkPixels++;
    }
    // Coppery Bronze scale: specific bronze warm metallic hue (r > g > b, reddish orange brown)
    if (r > 100 && r < 210 && g > 70 && g < 155 && b > 35 && b < 115 && r > 1.2 * g && g > 1.1 * b) {
      copperyPixels++;
    }
  }
  const brightness = totalLuminance / numPixels;
  
  // 2. Calculate Laplacian-approx sharpness (spatial gradient variance)
  let diffSum = 0;
  let diffSqSum = 0;
  let sampleCount = 0;
  
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const idx = (y * w + x) * 4;
      const val = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      
      // Compute vertical & horizontal differences
      const idxRight = (y * w + (x + 1)) * 4;
      const valRight = (data[idxRight] + data[idxRight+1] + data[idxRight+2]) / 3;
      
      const idxDown = ((y + 1) * w + x) * 4;
      const valDown = (data[idxDown] + data[idxDown+1] + data[idxDown+2]) / 3;
      
      const gradX = val - valRight;
      const gradY = val - valDown;
      const magnitude = Math.sqrt(gradX * gradX + gradY * gradY);
      
      diffSum += magnitude;
      diffSqSum += magnitude * magnitude;
      sampleCount++;
    }
  }
  
  // Sharpness is approximated by the variance of the gradient magnitudes
  const meanGrad = diffSum / (sampleCount || 1);
  const sharpness = (diffSqSum / (sampleCount || 1)) - (meanGrad * meanGrad);
  
  // Formulate status categories
  const exposureStatus = brightness < 40 ? 'dark' : brightness > 235 ? 'bright' : 'good';
  const sharpnessStatus = sharpness < 1 ? 'blurry' : 'sharp';
  
  return {
    width: img.width,
    height: img.height,
    megapixels: Number(((img.width * img.height) / 1000000).toFixed(2)),
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness),
    exposureStatus,
    sharpnessStatus,
    rednessScale: Number(((redPixels / numPixels) * 100).toFixed(2)),
    whitenessScale: Number(((whitePixels / numPixels) * 100).toFixed(2)),
    darknessScale: Number(((darkPixels / numPixels) * 100).toFixed(2)),
    copperyScale: Number(((copperyPixels / numPixels) * 100).toFixed(2))
  };
}

/**
 * Enhances skin images in sequence:
 * 1. Resolution standardization & smart upscaling
 * 2. Gray World White Balance (neutralizes off-temperature ambient light)
 * 3. Contrast Stretching (expands luminance histogram safely)
 * 4. Image Sharpness Convolution (enhances fine skin lesion scales/plaque margins)
 */
export async function enhanceSkinImage(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    
    // Standardize resolution boundary for diagnostics (1240x1240 px, matching our model)
    const targetDim = 1240;
    canvas.width = targetDim;
    canvas.height = targetDim;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl; // fallback
    
    // Draw and scale to high-resolution square (preserves aspect ratio by center-cropping safely)
    const scale = Math.max(targetDim / img.width, targetDim / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (targetDim - w) / 2;
    const y = (targetDim - h) / 2;
    
    // Use high-quality resizing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    
    const imageData = ctx.getImageData(0, 0, targetDim, targetDim);
    const pixels = imageData.data;
    const len = pixels.length;
    
    // === PIPELINE STEP 1: Gray World Assumption White Balance ===
    let rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < len; i += 4) {
      rSum += pixels[i];
      gSum += pixels[i + 1];
      bSum += pixels[i + 2];
    }
    const count = len / 4;
    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;
    const gray = (rAvg + gAvg + bAvg) / 3;
    
    // Apply scales only if illumination isn't completely monochromatic
    if (gray > 10 && rAvg > 5 && gAvg > 5 && bAvg > 5) {
      const rScale = gray / rAvg;
      const gScale = gray / gAvg;
      const bScale = gray / bAvg;
      
      for (let i = 0; i < len; i += 4) {
        pixels[i] = Math.min(255, Math.max(0, pixels[i] * rScale));
        pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] * gScale));
        pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] * bScale));
      }
    }
    
    // === PIPELINE STEP 2: Contrast Stretching / Safe Histogram Expansion ===
    let minR = 255, maxR = 0;
    let minG = 255, maxG = 0;
    let minB = 255, maxB = 0;
    
    // Read min/max, skipping deep shadows/highlights to prevent noise blowing up
    for (let i = 0; i < len; i += 32) { // sample to avoid performance hit
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Avoid hot pixels & deep clip shadows
      if (r > 10 && r < 245) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
      if (g > 10 && g < 245) {
        if (g < minG) minG = g;
        if (g > maxG) maxG = g;
      }
      if (b > 10 && b < 245) {
        if (b < minB) minB = b;
        if (b > maxB) maxB = b;
      }
    }
    
    // Guard ranges
    const rRange = (maxR - minR) || 1;
    const gRange = (maxG - minG) || 1;
    const bRange = (maxB - minB) || 1;
    
    for (let i = 0; i < len; i += 4) {
      // Linear stretching
      pixels[i] = Math.min(255, Math.max(0, ((pixels[i] - minR) / rRange) * 255));
      pixels[i + 1] = Math.min(255, Math.max(0, ((pixels[i + 1] - minG) / gRange) * 255));
      pixels[i + 2] = Math.min(255, Math.max(0, ((pixels[i + 2] - minB) / bRange) * 255));
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // === PIPELINE STEP 3: Sharpening Convolution (High-Definition Restore) ===
    // Apply a convolution filter matrix to recover blurred edges & micro-textures (Dermis plaques)
    const sharpenWeights = [
       0,   -0.15,  0,
      -0.15, 1.6,  -0.15,
       0,   -0.15,  0
    ];
    
    const side = 3;
    const halfSide = 1;
    const srcPixels = new Uint8ClampedArray(pixels);
    const outputImageData = ctx.createImageData(targetDim, targetDim);
    const dstPixels = outputImageData.data;
    
    for (let y = 0; y < targetDim; y++) {
      for (let x = 0; x < targetDim; x++) {
        const dstOff = (y * targetDim + x) * 4;
        let r = 0, g = 0, b = 0;
        
        for (let cy = 0; cy < side; cy++) {
          for (let cx = 0; cx < side; cx++) {
            const scy = Math.min(targetDim - 1, Math.max(0, y + cy - halfSide));
            const scx = Math.min(targetDim - 1, Math.max(0, x + cx - halfSide));
            const srcOff = (scy * targetDim + scx) * 4;
            const wt = sharpenWeights[cy * side + cx];
            
            r += srcPixels[srcOff] * wt;
            g += srcPixels[srcOff + 1] * wt;
            b += srcPixels[srcOff + 2] * wt;
          }
        }
        
        dstPixels[dstOff] = Math.min(255, Math.max(0, r));
        dstPixels[dstOff + 1] = Math.min(255, Math.max(0, g));
        dstPixels[dstOff + 2] = Math.min(255, Math.max(0, b));
        dstPixels[dstOff + 3] = srcPixels[dstOff + 3]; // fully opaque
      }
    }
    
    ctx.putImageData(outputImageData, 0, 0);
    console.log("[Avabhasini Enhancer] Layer 3 pipeline executed successfully.");
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (error) {
    console.error("[Avabhasini Enhancer] Error, using original fallback:", error);
    return dataUrl;
  }
}
