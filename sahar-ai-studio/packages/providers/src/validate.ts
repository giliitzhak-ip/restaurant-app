import type { GenerationRequest, VideoProvider } from './types';

export type RequestProblem =
  | 'notOperational'
  | 'operationUnsupported'
  | 'durationTooShort'
  | 'durationTooLong'
  | 'aspectUnsupported'
  | 'resolutionUnsupported';

export function aspectOf(width: number, height: number): '16:9' | '9:16' | null {
  if (width * 9 === height * 16) return '16:9';
  if (width * 16 === height * 9) return '9:16';
  return null;
}

/** Checks a request against a provider's declared capabilities before anything is queued. */
export function validateRequest(
  provider: VideoProvider,
  request: GenerationRequest,
): RequestProblem | null {
  if (!provider.availability().operational) return 'notOperational';
  const caps = provider.capabilities;
  if (!caps.operations.includes(request.operation)) return 'operationUnsupported';
  const duration = request.endMs - request.startMs;
  if (duration < caps.minDurationMs) return 'durationTooShort';
  if (duration > caps.maxDurationMs) return 'durationTooLong';
  const aspect = aspectOf(request.width, request.height);
  if (!aspect || !caps.aspectRatios.includes(aspect)) return 'aspectUnsupported';
  if (!caps.resolutions.some((r) => r.width === request.width && r.height === request.height)) {
    return 'resolutionUnsupported';
  }
  return null;
}
