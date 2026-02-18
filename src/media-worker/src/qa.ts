/**
 * QA Validation Module - Video quality and compliance checks
 */

import type { Env, VideoMetadata, ValidationResult, QAReport } from './types';

/**
 * Run all validation checks on video metadata
 */
export function validateVideo(metadata: VideoMetadata, env: Env): ValidationResult[] {
  const validations: ValidationResult[] = [];
  
  // Bitrate validation
  if (metadata.bitrate !== undefined) {
    const maxBitrate = parseInt(env.MAX_BITRATE_KBPS);
    const minBitrate = parseInt(env.MIN_BITRATE_KBPS);
    
    validations.push({
      check: 'bitrate_max',
      passed: metadata.bitrate <= maxBitrate,
      value: metadata.bitrate,
      expected: `<= ${maxBitrate} kbps`,
      message: metadata.bitrate > maxBitrate 
        ? `Bitrate ${metadata.bitrate}kbps exceeds maximum ${maxBitrate}kbps`
        : undefined,
    });
    
    validations.push({
      check: 'bitrate_min',
      passed: metadata.bitrate >= minBitrate,
      value: metadata.bitrate,
      expected: `>= ${minBitrate} kbps`,
      message: metadata.bitrate < minBitrate 
        ? `Bitrate ${metadata.bitrate}kbps below minimum ${minBitrate}kbps - may have quality issues`
        : undefined,
    });
  }
  
  // Resolution validation
  if (metadata.width && metadata.height) {
    const minWidth = 480;
    const minHeight = 360;
    const maxWidth = 4096;
    const maxHeight = 2160;
    
    validations.push({
      check: 'resolution_min',
      passed: metadata.width >= minWidth && metadata.height >= minHeight,
      value: `${metadata.width}x${metadata.height}`,
      expected: `>= ${minWidth}x${minHeight}`,
      message: (metadata.width < minWidth || metadata.height < minHeight)
        ? `Resolution too low for quality playback`
        : undefined,
    });
    
    validations.push({
      check: 'resolution_max',
      passed: metadata.width <= maxWidth && metadata.height <= maxHeight,
      value: `${metadata.width}x${metadata.height}`,
      expected: `<= ${maxWidth}x${maxHeight}`,
      message: (metadata.width > maxWidth || metadata.height > maxHeight)
        ? `Resolution exceeds maximum supported`
        : undefined,
    });
    
    // Aspect ratio check (common social media ratios)
    const aspectRatio = metadata.width / metadata.height;
    const validRatios = [
      { ratio: 16/9, name: '16:9 (landscape)' },
      { ratio: 9/16, name: '9:16 (portrait)' },
      { ratio: 1, name: '1:1 (square)' },
      { ratio: 4/5, name: '4:5 (instagram)' },
      { ratio: 4/3, name: '4:3 (standard)' },
    ];
    
    const closestRatio = validRatios.reduce((closest, current) => {
      const currentDiff = Math.abs(current.ratio - aspectRatio);
      const closestDiff = Math.abs(closest.ratio - aspectRatio);
      return currentDiff < closestDiff ? current : closest;
    });
    
    const ratioDiff = Math.abs(closestRatio.ratio - aspectRatio);
    validations.push({
      check: 'aspect_ratio',
      passed: ratioDiff < 0.1, // Within 10% of a standard ratio
      value: aspectRatio.toFixed(2),
      expected: closestRatio.name,
      message: ratioDiff >= 0.1
        ? `Unusual aspect ratio - may not display well on all platforms`
        : undefined,
    });
  }
  
  // Duration validation
  if (metadata.duration !== undefined) {
    const minDuration = 1; // seconds
    const maxDuration = 600; // 10 minutes
    const warningDuration = 180; // 3 minutes
    
    validations.push({
      check: 'duration_min',
      passed: metadata.duration >= minDuration,
      value: metadata.duration,
      expected: `>= ${minDuration}s`,
      message: metadata.duration < minDuration
        ? `Video too short`
        : undefined,
    });
    
    validations.push({
      check: 'duration_max',
      passed: metadata.duration <= maxDuration,
      value: metadata.duration,
      expected: `<= ${maxDuration}s`,
      message: metadata.duration > maxDuration
        ? `Video exceeds maximum duration of ${maxDuration}s`
        : undefined,
    });
    
    if (metadata.duration > warningDuration && metadata.duration <= maxDuration) {
      validations.push({
        check: 'duration_warning',
        passed: true, // Pass but with warning
        value: metadata.duration,
        expected: `<= ${warningDuration}s recommended`,
        message: `Long video may have reduced engagement`,
      });
    }
  }
  
  // Codec validation
  if (metadata.codec) {
    const supportedCodecs = ['h264', 'h265', 'hevc', 'vp8', 'vp9', 'av1'];
    const recommendedCodecs = ['h264', 'h265', 'hevc'];
    
    const codecLower = metadata.codec.toLowerCase();
    const isSupported = supportedCodecs.some(c => codecLower.includes(c));
    const isRecommended = recommendedCodecs.some(c => codecLower.includes(c));
    
    validations.push({
      check: 'codec_supported',
      passed: isSupported,
      value: metadata.codec,
      expected: supportedCodecs.join(', '),
      message: !isSupported
        ? `Codec ${metadata.codec} may not be supported on all devices`
        : undefined,
    });
    
    if (isSupported && !isRecommended) {
      validations.push({
        check: 'codec_recommended',
        passed: true, // Pass with note
        value: metadata.codec,
        expected: recommendedCodecs.join(', '),
        message: `H.264/H.265 recommended for best compatibility`,
      });
    }
  }
  
  // Frame rate validation
  if (metadata.frameRate !== undefined) {
    const minFps = 24;
    const maxFps = 60;
    const standardFps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
    
    validations.push({
      check: 'framerate_range',
      passed: metadata.frameRate >= minFps && metadata.frameRate <= maxFps,
      value: metadata.frameRate,
      expected: `${minFps}-${maxFps} fps`,
      message: (metadata.frameRate < minFps || metadata.frameRate > maxFps)
        ? `Frame rate outside standard range`
        : undefined,
    });
    
    // Check for non-standard frame rate
    const isStandard = standardFps.some(fps => Math.abs(fps - metadata.frameRate!) < 0.5);
    if (!isStandard) {
      validations.push({
        check: 'framerate_standard',
        passed: true, // Warning only
        value: metadata.frameRate,
        expected: standardFps.join(', '),
        message: `Non-standard frame rate may cause playback issues`,
      });
    }
  }
  
  return validations;
}

/**
 * Generate QA report from validations
 */
export function generateQAReport(
  uploadId: string,
  key: string,
  metadata: VideoMetadata,
  validations: ValidationResult[]
): QAReport {
  const failures = validations.filter(v => !v.passed);
  const warnings = validations.filter(v => v.passed && v.message);
  
  let overall: 'pass' | 'fail' | 'warning';
  if (failures.length > 0) {
    overall = 'fail';
  } else if (warnings.length > 0) {
    overall = 'warning';
  } else {
    overall = 'pass';
  }
  
  return {
    uploadId,
    key,
    timestamp: Date.now(),
    overall,
    validations,
    metadata,
  };
}

/**
 * Format QA report for human-readable output
 */
export function formatQAReport(report: QAReport): string {
  const lines: string[] = [
    `## QA Report: ${report.uploadId}`,
    `**Status:** ${report.overall.toUpperCase()}`,
    `**File:** ${report.key}`,
    `**Time:** ${new Date(report.timestamp).toISOString()}`,
    '',
    '### Metadata',
    report.metadata.duration ? `- Duration: ${report.metadata.duration.toFixed(1)}s` : '',
    report.metadata.width && report.metadata.height 
      ? `- Resolution: ${report.metadata.width}x${report.metadata.height}` : '',
    report.metadata.bitrate ? `- Bitrate: ${report.metadata.bitrate} kbps` : '',
    report.metadata.codec ? `- Codec: ${report.metadata.codec}` : '',
    report.metadata.frameRate ? `- Frame Rate: ${report.metadata.frameRate} fps` : '',
    '',
    '### Validations',
  ];
  
  for (const v of report.validations) {
    const icon = v.passed ? '✅' : '❌';
    const msg = v.message ? ` - ${v.message}` : '';
    lines.push(`${icon} **${v.check}**: ${v.value} (expected: ${v.expected})${msg}`);
  }
  
  return lines.filter(l => l !== '').join('\n');
}

/**
 * Check if video needs transcoding based on QA results
 */
export function needsTranscoding(report: QAReport): boolean {
  // Check for issues that transcoding could fix
  const bitrateHigh = report.validations.find(
    v => v.check === 'bitrate_max' && !v.passed
  );
  const unsupportedCodec = report.validations.find(
    v => v.check === 'codec_supported' && !v.passed
  );
  const resolutionHigh = report.validations.find(
    v => v.check === 'resolution_max' && !v.passed
  );
  
  return !!(bitrateHigh || unsupportedCodec || resolutionHigh);
}

/**
 * Get recommended transcode settings based on QA report
 */
export function getTranscodeRecommendation(report: QAReport): {
  targetBitrate?: number;
  targetResolution?: { width: number; height: number };
  targetCodec?: string;
} {
  const recommendation: {
    targetBitrate?: number;
    targetResolution?: { width: number; height: number };
    targetCodec?: string;
  } = {};
  
  // Recommend bitrate reduction if too high
  if (report.metadata.bitrate && report.metadata.bitrate > 8000) {
    recommendation.targetBitrate = 5000; // 5 Mbps is good for 1080p
  }
  
  // Recommend resolution reduction if too high
  if (report.metadata.width && report.metadata.height) {
    if (report.metadata.width > 1920 || report.metadata.height > 1080) {
      recommendation.targetResolution = { width: 1920, height: 1080 };
    }
  }
  
  // Recommend H.264 for compatibility
  if (report.metadata.codec && !['h264', 'avc'].includes(report.metadata.codec.toLowerCase())) {
    recommendation.targetCodec = 'h264';
  }
  
  return recommendation;
}
