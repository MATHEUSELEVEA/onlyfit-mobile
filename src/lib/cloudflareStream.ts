// Helpers derivados da URL HLS do Cloudflare Stream. O playback vem como
// https://customer-XXXX.cloudflarestream.com/{uid}/manifest/video.m3u8 — a
// partir dele dá para montar outros recursos do mesmo asset sem novo dado.

const HLS_RE = /^(https:\/\/[^/]+\/[^/]+)\/manifest\/video\.m3u8/;

/**
 * Thumbnail ANIMADO (GIF) do Cloudflare Stream — prévia em movimento para
 * grids, no lugar do poster estático. Curto e de baixa resolução para não
 * pesar. Devolve null quando não há HLS (vídeo ainda não normalizado).
 */
export function cloudflareAnimatedThumb(
  hlsUrl: string | null | undefined,
  opts: { durationSeconds?: number; height?: number; fps?: number } = {},
): string | null {
  if (!hlsUrl) return null;
  const match = hlsUrl.match(HLS_RE);
  if (!match) return null;
  const duration = opts.durationSeconds ?? 3;
  const height = opts.height ?? 320;
  const fps = opts.fps ?? 12;
  return `${match[1]}/thumbnails/thumbnail.gif?duration=${duration}s&height=${height}&fps=${fps}`;
}
