/**
 * Centralized Logging Utility for @dailydealfeed Pipeline
 * 
 * Provides consistent, level-aware logging across all pipeline components.
 * 
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.editor('INFO', 'Processing video', { asin: 'B001234' });
 *   logger.queue('ERROR', 'Item failed', { stack: error.stack });
 * 
 * Environment:
 *   LOG_LEVEL=DEBUG|INFO|WARN|ERROR (default: INFO)
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

// ANSI color codes for terminal output
const COLORS = {
  DEBUG: '\x1b[36m',  // Cyan
  INFO: '\x1b[32m',   // Green
  WARN: '\x1b[33m',   // Yellow
  ERROR: '\x1b[31m',  // Red
  RESET: '\x1b[0m'
};

/**
 * Core logging function
 * @param {string} component - Component name (EDITOR, QUEUE, QA, etc.)
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {Object|null} data - Optional structured data
 */
function log(component, level, message, data = null) {
  if (LOG_LEVELS[level] === undefined) {
    level = 'INFO';
  }
  
  if (LOG_LEVELS[level] >= CURRENT_LEVEL) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || '';
    const reset = COLORS.RESET;
    
    // Format: [timestamp] [COMPONENT] [LEVEL] message
    const logLine = `${color}[${timestamp}] [${component}] [${level}]${reset} ${message}`;
    
    // Use console.error for ERROR level so it goes to stderr
    if (level === 'ERROR') {
      console.error(logLine);
    } else {
      console.log(logLine);
    }
    
    // Print structured data if provided
    if (data) {
      // Filter out sensitive data
      const safeData = { ...data };
      if (safeData.stack) {
        // Truncate stack traces for readability
        safeData.stack = safeData.stack.split('\n').slice(0, 5).join('\n');
      }
      console.log(JSON.stringify(safeData, null, 2));
    }
  }
}

/**
 * Create a component-specific logger
 * @param {string} component - Component name
 */
function createLogger(component) {
  return {
    debug: (msg, data) => log(component, 'DEBUG', msg, data),
    info: (msg, data) => log(component, 'INFO', msg, data),
    warn: (msg, data) => log(component, 'WARN', msg, data),
    error: (msg, data) => log(component, 'ERROR', msg, data),
    // Legacy method signature: (level, msg, data)
    log: (level, msg, data) => log(component, level, msg, data)
  };
}

// Pre-configured component loggers
const editor = createLogger('EDITOR');
const queue = createLogger('QUEUE');
const qa = createLogger('QA');
const embed = createLogger('EMBED');
const amazon = createLogger('AMAZON');
const tts = createLogger('TTS');
const ffmpeg = createLogger('FFMPEG');

// Helper to wrap async operations with error logging
async function withErrorLogging(component, operation, fn) {
  const logger = createLogger(component);
  try {
    return await fn();
  } catch (error) {
    logger.error(`${operation} failed: ${error.message}`, {
      stack: error.stack,
      operation
    });
    throw error;
  }
}

// Helper to log file operations
function logFileOp(component, op, filePath, success, error = null) {
  const logger = createLogger(component);
  const filename = require('path').basename(filePath);
  
  if (success) {
    logger.debug(`${op}: ${filename}`, { path: filePath });
  } else {
    logger.error(`${op} failed: ${filename}`, { 
      path: filePath, 
      error: error?.message 
    });
  }
}

// Helper to log timing
function logTiming(component, operation, startTime) {
  const logger = createLogger(component);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info(`${operation} completed in ${elapsed}s`);
}

module.exports = {
  // Core function
  log,
  
  // Component loggers (legacy signature: level, msg, data)
  editor: (level, msg, data) => log('EDITOR', level, msg, data),
  queue: (level, msg, data) => log('QUEUE', level, msg, data),
  qa: (level, msg, data) => log('QA', level, msg, data),
  embed: (level, msg, data) => log('EMBED', level, msg, data),
  amazon: (level, msg, data) => log('AMAZON', level, msg, data),
  tts: (level, msg, data) => log('TTS', level, msg, data),
  ffmpeg: (level, msg, data) => log('FFMPEG', level, msg, data),
  
  // Object-style loggers (preferred: logger.editor.info('msg'))
  editorLog: editor,
  queueLog: queue,
  qaLog: qa,
  embedLog: embed,
  amazonLog: amazon,
  ttsLog: tts,
  ffmpegLog: ffmpeg,
  
  // Factory
  createLogger,
  
  // Helpers
  withErrorLogging,
  logFileOp,
  logTiming,
  
  // Constants
  LOG_LEVELS,
  CURRENT_LEVEL
};
