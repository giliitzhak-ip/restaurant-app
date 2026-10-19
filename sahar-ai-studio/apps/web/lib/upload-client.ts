'use client';

export type UploadErrorCode =
  | 'tooLarge'
  | 'unsupportedType'
  | 'consentRequired'
  | 'rateLimited'
  | 'notFound'
  | 'projectHasTakes'
  | 'network'
  | 'unauthorized'
  | 'generic';

export interface UploadOutcome {
  ok: boolean;
  assetId?: string;
  error?: UploadErrorCode;
}

const KNOWN: UploadErrorCode[] = [
  'tooLarge',
  'unsupportedType',
  'consentRequired',
  'rateLimited',
  'notFound',
  'projectHasTakes',
  'unauthorized',
];

/**
 * Sends a file as the raw request body. XMLHttpRequest (not fetch) because only XHR
 * reports real upload progress in Safari.
 */
export function uploadFile(
  url: string,
  file: File,
  consentVersion: string,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-Consent', consentVersion);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => resolve({ ok: false, error: 'network' });
    xhr.onabort = () => resolve({ ok: false, error: 'network' });
    xhr.onload = () => {
      let body: { assetId?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.assetId) {
        onProgress(1);
        resolve({ ok: true, assetId: body.assetId });
        return;
      }
      if (xhr.status === 401) return resolve({ ok: false, error: 'unauthorized' });
      const code = KNOWN.find((known) => known === body.error);
      resolve({ ok: false, error: code ?? 'generic' });
    };
    xhr.send(file);
  });
}
