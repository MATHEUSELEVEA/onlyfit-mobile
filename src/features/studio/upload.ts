import { supabase } from '@/lib/supabase';

// Envio de mídia para o R2 via edge function compartilhada com o v1
// (create-r2-upload-url): a função devolve uma URL PUT assinada e a URL pública
// final. O cliente nunca vê credencial de storage.

type Bucket = 'onlyfit-media' | 'onlyfit-thumbnails' | 'onlyfit-avatar' | 'onlyfit-stories';

function assertReadableStoryUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('O servidor de mídia não forneceu uma URL válida para o story.');
  }
  const privateR2 =
    parsed.hostname === 'r2.cloudflarestorage.com' ||
    parsed.hostname.endsWith('.r2.cloudflarestorage.com');
  const signedR2Read =
    privateR2 &&
    parsed.searchParams.has('X-Amz-Signature') &&
    parsed.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256';
  if (parsed.protocol !== 'https:' || (privateR2 && !signedR2Read) || !parsed.pathname) {
    throw new Error('O servidor de mídia não forneceu uma URL legível para o story.');
  }
  return value;
}

function shouldUploadThroughFunction(file: Blob): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  return (protocol === 'capacitor:' || protocol === 'ionic:') && file.size <= 20 * 1024 * 1024;
}

// PUT via XMLHttpRequest em vez de fetch: é o único jeito de expor progresso
// de upload de forma confiável no WebKit (a Progress API de fetch para upload
// não tem suporte consistente em WKWebView/Safari).
function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Falha ao enviar o arquivo. Tente novamente.'));
    };
    xhr.onerror = () => reject(new Error('Falha ao enviar o arquivo. Tente novamente.'));
    xhr.send(file);
  });
}

type SecureVideoUploadSession = {
  uploadUrl: string;
  uploadId: string;
  uploadHeaders: Record<string, string>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateSecureVideoSession(
  value: unknown,
  contentType: string,
  contentLength: number,
): SecureVideoUploadSession {
  const data = (value ?? {}) as Record<string, unknown>;
  const uploadUrl = typeof data.uploadUrl === 'string' ? data.uploadUrl : '';
  const uploadId = typeof data.uploadId === 'string' ? data.uploadId : '';
  const headers = data.uploadHeaders as Record<string, unknown> | undefined;
  let parsed: URL;
  try {
    parsed = new URL(uploadUrl);
  } catch {
    throw new Error('Resposta inválida do servidor de mídia.');
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.r2.cloudflarestorage.com') ||
    !UUID_PATTERN.test(uploadId) ||
    data.contentType !== contentType ||
    data.contentLength !== contentLength ||
    !headers ||
    Object.keys(headers).length !== 1 ||
    headers['Content-Type'] !== contentType
  ) {
    throw new Error('Resposta inválida do servidor de mídia.');
  }
  return { uploadUrl, uploadId, uploadHeaders: { 'Content-Type': contentType } };
}

function secureVideoPut(
  session: SecureVideoUploadSession,
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 5 * 60 * 1000;
    xhr.open('PUT', session.uploadUrl);
    Object.entries(session.uploadHeaders).forEach(([header, value]) => xhr.setRequestHeader(header, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const unavailable = [401, 403, 404].includes(xhr.status);
      reject(Object.assign(new Error(unavailable
        ? 'O armazenamento de vídeos está indisponível no momento. Tente novamente em instantes.'
        : 'O serviço de vídeos recusou o arquivo. Tente exportá-lo novamente.'), { status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(
      new Error('A conexão foi interrompida durante o envio do vídeo.'),
      { status: 0 },
    ));
    xhr.ontimeout = () => reject(Object.assign(
      new Error('O envio do vídeo demorou demais. Verifique a conexão e tente novamente.'),
      { status: 408 },
    ));
    xhr.send(file);
  });
}

function isTransientStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Upload de vídeo sempre passa por quarentena privada e atestado do servidor. */
export async function uploadVerifiedVideo(
  file: Blob,
  filename: string,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-r2-video-upload', {
    body: {
      filename,
      content_type: contentType,
      content_length: file.size,
      audio_mode: 'preserve',
    },
  });
  if (error) throw error;
  const session = validateSecureVideoSession(data, contentType, file.size);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await secureVideoPut(session, file, onProgress);
      break;
    } catch (putError) {
      const status = Number((putError as { status?: unknown })?.status ?? -1);
      if (attempt === 3 || !isTransientStatus(status)) throw putError;
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** (attempt - 1)));
    }
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const finalized = await supabase.functions.invoke('finalize-r2-video-upload', {
      body: { upload_id: session.uploadId },
    });
    if (!finalized.error) {
      const result = (finalized.data ?? {}) as Record<string, unknown>;
      if (
        typeof result.publicUrl !== 'string' ||
        !result.publicUrl.startsWith('https://') ||
        result.audioMode !== 'preserve' ||
        typeof result.hasAudio !== 'boolean' ||
        !['iso-bmff', 'webm', 'ogg'].includes(String(result.container ?? ''))
      ) throw new Error('O servidor não confirmou a segurança do vídeo.');
      return result.publicUrl;
    }
    const status = Number((finalized.error as { context?: { status?: unknown }; status?: unknown })
      .context?.status ?? (finalized.error as { status?: unknown }).status ?? -1);
    if (attempt === 3 || (!isTransientStatus(status) && status !== 409)) throw finalized.error;
    await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** (attempt - 1)));
  }
  throw new Error('Não foi possível validar o vídeo com segurança.');
}

export async function uploadAsset(
  file: Blob,
  filename: string,
  contentType: string,
  bucket: Bucket,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (shouldUploadThroughFunction(file)) {
    const form = new FormData();
    form.append('file', file, filename);
    form.append('filename', filename);
    form.append('content_type', contentType);
    form.append('target_bucket', bucket);
    form.append('content_length', String(file.size));

    const { data, error } = await supabase.functions.invoke('create-r2-upload-url', {
      body: form,
    });
    if (error) throw error;
    onProgress?.(1);

    const { publicUrl } = data as { publicUrl: string };
    return bucket === 'onlyfit-stories' ? assertReadableStoryUrl(publicUrl) : publicUrl;
  }

  const { data, error } = await supabase.functions.invoke('create-r2-upload-url', {
    body: {
      filename,
      content_type: contentType,
      target_bucket: bucket,
      content_length: file.size,
    },
  });
  if (error) throw error;

  const { uploadUrl, publicUrl } = data as { uploadUrl: string; publicUrl: string };
  await putWithProgress(uploadUrl, file, contentType, onProgress);

  return bucket === 'onlyfit-stories' ? assertReadableStoryUrl(publicUrl) : publicUrl;
}

// Captura o primeiro quadro de um vídeo local como poster (thumbnail_url). É
// best-effort: se o navegador não conseguir decodificar, devolve null e o post
// segue sem poster. Roda sobre object URL (mesma origem), então o canvas não é
// marcado como "tainted".
//
// Usada apenas para o caminho legado (vídeo escolhido da galeria/picker). Para
// vídeo gravado pela câmera (CameraStep/useVideoCapture), o poster já vem
// capturado ao vivo do stream — ver DraftMedia.posterBlob — e este caminho é
// pulado inteiramente.
function capturePosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0.1);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) {
        cleanup();
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          resolve(blob);
        },
        'image/jpeg',
        0.85,
      );
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

// Timeout de segurança: vídeos .mov/HEVC que a WebView não decodifica bem
// podem nunca disparar onloadeddata/onseeked, deixando essa promise pendente
// para sempre — e como o post inteiro esperava por ela, o "Publicando…"
// travava eternamente. A função já é best-effort (null = "sem poster, segue o
// post"), então o timeout só adianta essa resposta em vez de travar o fluxo.
export function captureVideoPoster(file: File, timeoutMs = 4000): Promise<Blob | null> {
  return Promise.race([
    capturePosterFrame(file),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
