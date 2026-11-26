/**
 * Smart URL and embed code parser for interactive educational content
 */
import type { UserRole } from '../types';

export interface EmbedValidationResult {
  isValid: boolean;
  type: 'iframe' | 'html' | 'url' | 'youtube' | 'invalid';
  srcDoc?: string;
  srcUrl?: string;
  errorMessage?: string;
}

export type AppSourceKind =
  | 'html'
  | 'iframe'
  | 'gemini'
  | 'aistudio'
  | 'vercel'
  | 'youtube'
  | 'url'
  | 'unknown';

export interface AppSourceInfo {
  kind: AppSourceKind;
  label: string;
  url?: string;
  iframeBlockedLikely: boolean;
}

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If it's an iframe containing a YouTube src, inspect the src
  const iframeSrcMatch = trimmed.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  const candidate = iframeSrcMatch ? iframeSrcMatch[1] : trimmed;

  const regExp =
    /^.*(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/|live\/)|[?&]v=)([^#&?/\s"']{11}).*/i;
  const match = candidate.match(regExp);
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }

  return null;
}

export function parseYouTubeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.toLowerCase().includes('<iframe')) {
    return null;
  }

  const videoId = extractYouTubeVideoId(trimmed);
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;
  }

  return null;
}

function tryNormalizeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.startsWith('<')) return null;

  const withProtocol =
    /^https?:\/\//i.test(trimmed)
      ? trimmed
      : /^(?:[a-z0-9-]+\.)+(?:vercel\.app|run\.app|google\.com|ai\.studio|youtu\.be|youtube\.com|netlify\.app|github\.io)(?:[/:?#].*)?$/i.test(
          trimmed
        )
      ? `https://${trimmed}`
      : trimmed;

  try {
    const urlObj = new URL(withProtocol);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return urlObj.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function isIframeBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'gemini.google.com' ||
    host.endsWith('.gemini.google.com') ||
    host === 'g.co' ||
    host === 'aistudio.google.com' ||
    host === 'ai.studio' ||
    host.endsWith('.ai.studio')
  );
}

function isLikelyHtmlCode(raw: string): boolean {
  return /<(?:!doctype|html|head|body|div|canvas|script|style|svg|section|main|article|h[1-6]|p|table|form|button)\b/i.test(
    raw
  );
}

export function classifyAppSource(input?: string): AppSourceInfo {
  const raw = (input || '').trim();
  if (!raw) {
    return { kind: 'unknown', label: 'Chưa xác định', iframeBlockedLikely: false };
  }

  const yt = parseYouTubeUrl(raw);
  if (yt) {
    const normalizedUrl = tryNormalizeExternalUrl(raw) || yt;
    return {
      kind: 'youtube',
      label: 'YouTube',
      url: normalizedUrl,
      iframeBlockedLikely: false,
    };
  }

  const iframeMatch = raw.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  if (iframeMatch) {
    const iframeSrc = iframeMatch[1];
    try {
      const host = new URL(iframeSrc).hostname;
      return {
        kind: 'iframe',
        label: 'Mã nhúng Iframe',
        url: iframeSrc,
        iframeBlockedLikely: isIframeBlockedHost(host),
      };
    } catch {
      return {
        kind: 'iframe',
        label: 'Mã nhúng Iframe',
        url: iframeSrc,
        iframeBlockedLikely: false,
      };
    }
  }

  if (isLikelyHtmlCode(raw)) {
    return {
      kind: 'html',
      label: 'HTML nhúng',
      iframeBlockedLikely: false,
    };
  }

  const normalizedUrl = tryNormalizeExternalUrl(raw);
  if (normalizedUrl) {
    try {
      const host = new URL(normalizedUrl).hostname.toLowerCase();
      if (host === 'gemini.google.com' || host.endsWith('.gemini.google.com') || host === 'g.co') {
        return {
          kind: 'gemini',
          label: 'Google Gemini',
          url: normalizedUrl,
          iframeBlockedLikely: true,
        };
      }
      if (host === 'aistudio.google.com' || host === 'ai.studio' || host.endsWith('.ai.studio')) {
        return {
          kind: 'aistudio',
          label: 'Google AI Studio',
          url: normalizedUrl,
          iframeBlockedLikely: true,
        };
      }
      if (host.endsWith('.run.app')) {
        return {
          kind: 'aistudio',
          label: 'Google AI Studio App',
          url: normalizedUrl,
          iframeBlockedLikely: false,
        };
      }
      if (host.endsWith('.vercel.app') || host.includes('vercel.com')) {
        return {
          kind: 'vercel',
          label: 'Vercel',
          url: normalizedUrl,
          iframeBlockedLikely: false,
        };
      }
      return {
        kind: 'url',
        label: 'Liên kết Web',
        url: normalizedUrl,
        iframeBlockedLikely: false,
      };
    } catch {}
  }

  return { kind: 'unknown', label: 'Ứng dụng', iframeBlockedLikely: false };
}

export const INLINE_EMBED_MAX_UTF8_BYTES = 450_000;
export const CHUNK_EMBED_MAX_UTF8_BYTES = 350_000;
export const MAX_TOTAL_EMBED_UTF8_BYTES = 4_500_000;

export function getUtf8ByteLength(value: string): number {
  if (!value) return 0;
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value).length;
    }
  } catch {}
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function splitStringByUtf8Bytes(
  value: string,
  maxBytesPerChunk = CHUNK_EMBED_MAX_UTF8_BYTES
): string[] {
  if (!value) return [];
  if (getUtf8ByteLength(value) <= maxBytesPerChunk) {
    return [value];
  }

  const chunks: string[] = [];
  let start = 0;
  let currentBytes = 0;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    let charUnits = 1;
    let charBytes = 1;

    if (code <= 0x7f) {
      charBytes = 1;
    } else if (code <= 0x7ff) {
      charBytes = 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      charUnits = 2;
      charBytes = 4;
    } else {
      charBytes = 3;
    }

    if (currentBytes + charBytes > maxBytesPerChunk && i > start) {
      chunks.push(value.slice(start, i));
      start = i;
      currentBytes = 0;
    }

    currentBytes += charBytes;
    if (charUnits === 2) {
      i += 1;
    }
  }

  if (start < value.length) {
    chunks.push(value.slice(start));
  }

  return chunks;
}

export function validateAndFormatEmbed(input: string): EmbedValidationResult {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      type: 'invalid',
      errorMessage:
        'Vui lòng dán mã nhúng HTML (<!DOCTYPE html>...), thẻ <iframe> hoặc link Google Gemini, Google AI Studio, Vercel.',
    };
  }

  const raw = input.trim();
  const totalBytes = getUtf8ByteLength(raw);

  if (totalBytes > MAX_TOTAL_EMBED_UTF8_BYTES) {
    return {
      isValid: false,
      type: 'invalid',
      errorMessage:
        'Mã nhúng HTML vượt quá giới hạn tối đa 4,5 MB. Hãy rút gọn tài nguyên nhúng hoặc dùng link Google Gemini / Google AI Studio / Vercel.',
    };
  }

  // Check if it's a direct YouTube URL
  const youtubeEmbed = parseYouTubeUrl(raw);
  if (youtubeEmbed) {
    return {
      isValid: true,
      type: 'youtube',
      srcUrl: youtubeEmbed,
    };
  }

  // Check if it's an iframe tag
  const iframeMatch = raw.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  if (iframeMatch) {
    return {
      isValid: true,
      type: 'iframe',
      srcDoc: raw,
      srcUrl: iframeMatch[1],
    };
  }

  // Check if it's general HTML (e.g., app/game written in HTML/CSS/JS exported by Gemini or AI Studio)
  if (isLikelyHtmlCode(raw)) {
    return {
      isValid: true,
      type: 'html',
      srcDoc: raw,
    };
  }

  // Check if it's a valid http/https URL (including Gemini, Google AI Studio, Vercel)
  const normalizedUrl = tryNormalizeExternalUrl(raw);
  if (normalizedUrl) {
    return {
      isValid: true,
      type: 'url',
      srcUrl: normalizedUrl,
    };
  }

  return {
    isValid: false,
    type: 'invalid',
    errorMessage:
      'Mã nhúng hoặc liên kết không đúng định dạng. Hỗ trợ mã HTML, thẻ <iframe>, hoặc link https:// từ Google Gemini, Google AI Studio, Vercel.',
  };
}

export interface TeacherStorageBridgeConfig {
  teacherId: string;
  itemId: string;
  initialData?: Record<string, string>;
  readOnly?: boolean;
  role?: UserRole;
}

function getParentHostOriginSafe(): string {
  try {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.origin &&
      window.location.origin !== 'null'
    ) {
      return window.location.origin;
    }
  } catch {}
  return '';
}

function buildRoleBootstrapScript(role?: UserRole): string {
  const safeRole = JSON.stringify(role || 'guest').replace(/</g, '\\u003c');
  const safeOrigin = JSON.stringify(getParentHostOriginSafe()).replace(/</g, '\\u003c');
  return `<script>window.__HOST_USER_ROLE__=${safeRole};window.__HOST_ORIGIN__=${safeOrigin};<\/script>`;
}

function buildStorageBridgeScript(config: TeacherStorageBridgeConfig): string {
  const safeJson = JSON.stringify(config.initialData || {}).replace(/</g, '\\u003c');
  const safeTeacherId = JSON.stringify(config.teacherId).replace(/</g, '\\u003c');
  const safeItemId = JSON.stringify(config.itemId).replace(/</g, '\\u003c');
  const safeRole = JSON.stringify(config.role || 'guest').replace(/</g, '\\u003c');
  const safeOrigin = JSON.stringify(getParentHostOriginSafe()).replace(/</g, '\\u003c');
  const readOnlyFlag = config.readOnly ? 'true' : 'false';

  return `<script>
window.__HOST_USER_ROLE__ = ${safeRole};
window.__HOST_ORIGIN__ = ${safeOrigin};
(function() {
  var __teacherId = ${safeTeacherId};
  var __itemId = ${safeItemId};
  var __readOnly = ${readOnlyFlag};
  var __mem = Object.assign({}, ${safeJson});
  var __localRef = null;
  try { __localRef = window.localStorage; } catch (e) {}

  var proto = window.Storage && window.Storage.prototype;
  if (proto) {
    var origGet = proto.getItem;
    var origSet = proto.setItem;
    var origRemove = proto.removeItem;
    var origClear = proto.clear;
    var origKey = proto.key;
    var origLenDesc = Object.getOwnPropertyDescriptor(proto, 'length');

    proto.getItem = function(k) {
      if (__localRef && this === __localRef) {
        var keyStr = String(k);
        return Object.prototype.hasOwnProperty.call(__mem, keyStr) ? __mem[keyStr] : null;
      }
      return origGet.call(this, k);
    };

    proto.setItem = function(k, v) {
      if (__localRef && this === __localRef) {
        var keyStr = String(k);
        var valStr = String(v);
        var changed = !Object.prototype.hasOwnProperty.call(__mem, keyStr) || __mem[keyStr] !== valStr;
        __mem[keyStr] = valStr;
        if (changed && !__readOnly && window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'TEACHER_APP_STORAGE_MUTATION',
            teacherId: __teacherId,
            itemId: __itemId,
            op: 'set',
            key: keyStr,
            value: valStr
          }, '*');
        }
        return;
      }
      return origSet.call(this, k, v);
    };

    proto.removeItem = function(k) {
      if (__localRef && this === __localRef) {
        var keyStr = String(k);
        var existed = Object.prototype.hasOwnProperty.call(__mem, keyStr);
        delete __mem[keyStr];
        if (existed && !__readOnly && window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'TEACHER_APP_STORAGE_MUTATION',
            teacherId: __teacherId,
            itemId: __itemId,
            op: 'remove',
            key: keyStr
          }, '*');
        }
        return;
      }
      return origRemove.call(this, k);
    };

    proto.clear = function() {
      if (__localRef && this === __localRef) {
        var keys = Object.keys(__mem);
        for (var i = 0; i < keys.length; i++) delete __mem[keys[i]];
        if (keys.length > 0 && !__readOnly && window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'TEACHER_APP_STORAGE_MUTATION',
            teacherId: __teacherId,
            itemId: __itemId,
            op: 'clear'
          }, '*');
        }
        return;
      }
      return origClear.call(this);
    };

    proto.key = function(idx) {
      if (__localRef && this === __localRef) {
        var keys = Object.keys(__mem);
        return keys[idx] !== undefined ? keys[idx] : null;
      }
      return origKey.call(this, idx);
    };

    try {
      Object.defineProperty(proto, 'length', {
        configurable: true,
        get: function() {
          if (__localRef && this === __localRef) {
            return Object.keys(__mem).length;
          }
          return origLenDesc && origLenDesc.get ? origLenDesc.get.call(this) : 0;
        }
      });
    } catch (e) {}
  }

  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'TEACHER_APP_STORAGE_EXTERNAL_SYNC') return;
    if (ev.data.itemId !== __itemId || ev.data.teacherId !== __teacherId) return;
    var nextData = ev.data.data || {};
    var oldKeys = Object.keys(__mem);
    for (var i = 0; i < oldKeys.length; i++) delete __mem[oldKeys[i]];
    Object.assign(__mem, nextData);
    try {
      window.dispatchEvent(new CustomEvent('teacher-storage-sync', { detail: nextData }));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {}
  });
})();
<\/script>`;
}

function injectScriptIntoHtml(html: string, scriptTag: string): string {
  if (!scriptTag) return html;
  const headMatch = html.match(/<head\b[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + scriptTag + '\n' + html.slice(insertPos);
  }
  const htmlMatch = html.match(/<html\b[^>]*>/i);
  if (htmlMatch && htmlMatch.index !== undefined) {
    const insertPos = htmlMatch.index + htmlMatch[0].length;
    return html.slice(0, insertPos) + '\n<head>' + scriptTag + '</head>\n' + html.slice(insertPos);
  }
  return scriptTag + '\n' + html;
}

/**
 * Wraps raw HTML or embed code into a self-contained responsive sandbox document
 */
export function generateSandboxHtml(code: string, storageBridge?: TeacherStorageBridgeConfig): string {
  const trimmed = code.trim();
  const bridgeScript = storageBridge
    ? buildStorageBridgeScript(storageBridge)
    : buildRoleBootstrapScript('guest');

  // If it's already a full HTML document, inject bridge/role script into <head> and return
  if (trimmed.toLowerCase().includes('<!doctype') || trimmed.toLowerCase().includes('<html')) {
    return bridgeScript ? injectScriptIntoHtml(trimmed, bridgeScript) : trimmed;
  }

  const wrapIframe = (iframeHtml: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
    iframe { width: 100% !important; height: 100% !important; border: none !important; }
  </style>
</head>
<body>
  ${iframeHtml}
</body>
</html>`;

  // Check if it's a YouTube URL
  const youtubeEmbed = parseYouTubeUrl(trimmed);
  if (youtubeEmbed) {
    return wrapIframe(
      `<iframe src="${youtubeEmbed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    );
  }

  // If it's an iframe, center it and ensure responsive 100% width and height
  if (trimmed.toLowerCase().includes('<iframe')) {
    return wrapIframe(trimmed);
  }

  // Check if it's a direct http/https URL (including normalized Vercel / Gemini / AI Studio URLs)
  const normalizedUrl = tryNormalizeExternalUrl(trimmed);
  if (normalizedUrl) {
    const safeSrc = normalizedUrl.replace(/"/g, '&quot;');
    return wrapIframe(
      `<iframe src="${safeSrc}" allow="accelerometer; autoplay; camera; clipboard-write; encrypted-media; gyroscope; microphone; picture-in-picture; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`
    );
  }

  // Otherwise, wrap in standard container with storage bridge
  return `<!DOCTYPE html>
<html>
<head>
  ${bridgeScript}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
}
