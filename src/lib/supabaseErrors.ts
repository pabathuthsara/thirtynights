type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
};

function errorFields(error: unknown) {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as SupabaseErrorLike;
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}

/**
 * PostgREST errors are structured objects, not guaranteed Error instances.
 * Convert the consent RPC's expected failures at the service boundary so the
 * UI never replaces useful diagnostics with a generic reconnect suggestion.
 */
export function processingConsentError(error: unknown) {
  const { code, message } = errorFields(error);
  const normalized = message?.toLowerCase() ?? '';

  if (
    code === 'PGRST202'
    || (normalized.includes('set_processing_consent') && normalized.includes('schema cache'))
  ) {
    return new Error(
      'Reflection processing is temporarily unavailable because the cloud service needs an update.',
    );
  }

  if (code === '42501' || normalized.includes('permanent account required')) {
    return new Error('Reconnect your recoverable account, then try again.');
  }

  if (error instanceof Error) return error;
  return new Error(message ?? 'Please check your connection and try again.');
}
