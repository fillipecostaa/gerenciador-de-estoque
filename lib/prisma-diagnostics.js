// Diagnóstico apenas no terminal. Nunca inclua o corpo da requisição ou o JWT.
export function prismaErrorDetails(error) {
  function redact(value, key = '') {
    if (/password|secret|token|authorization|database_url/i.test(key)) return '[oculto]';
    if (typeof value === 'string') {
      let result = value.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI oculta]')
        .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[hash oculto]');
      for (const secret of [process.env.DATABASE_URL, process.env.JWT_SECRET]) {
        if (secret) result = result.replaceAll(secret, '[segredo oculto]');
      }
      return result;
    }
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
    }
    return value;
  }
  return redact({ code: error.code, message: error.message, meta: error.meta });
}
