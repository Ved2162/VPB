"use client";
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api-client';

export function useApiResource<T>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T | null; pending: boolean; error: string }>({ key: url, data: null, pending: !!url, error: '' });
  const running = useRef(false);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    running.current = true;
    apiFetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Unable to load information');
      if (!controller.signal.aborted) setState({ key: url, data, pending: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ key: url, data: previous.key === url ? previous.data : null, pending: false, error: error.message }));
    }).finally(() => { if (!controller.signal.aborted) running.current = false; });
    return () => { controller.abort(); running.current = false; };
  }, [url, revision]);
  return {
    data: state.key === url ? state.data : null,
    previous: state.data,
    pending: !!url && (state.key !== url || state.pending),
    error: state.key === url ? state.error : '',
    refresh: () => {
      if (running.current || !url) return;
      setState(previous => ({ ...previous, pending: true, error: '' }));
      setRevision(value => value + 1);
    },
  };
}
