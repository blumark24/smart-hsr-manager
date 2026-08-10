export const REAUTHENTICATION_REQUIRED = 'reauthentication-required';

function reauthenticationError(cause) {
  const error = new Error(REAUTHENTICATION_REQUIRED, cause ? { cause } : undefined);
  error.code = REAUTHENTICATION_REQUIRED;
  return error;
}

export async function fetchWithFirebaseAuth({ getIdToken, input, init = {}, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getIdToken !== 'function') throw reauthenticationError();
  if (typeof fetchImpl !== 'function') throw new Error('fetch-unavailable');

  const execute = async forceRefresh => {
    let token;
    try { token = await getIdToken(forceRefresh); }
    catch (error) { throw reauthenticationError(error); }
    if (!token) throw reauthenticationError();
    return fetchImpl(input, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
  };

  const first = await execute(false);
  if (first.status !== 401) return first;
  return execute(true); // exactly one refresh and one retry; never loops
}

