import { useEffect, useState } from 'react';
import { api } from './api.js';

export function useResource(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: '' });
    api(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [path, version]);
  return { ...state, reload: () => setVersion(value => value + 1) };
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
