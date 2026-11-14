import { useEffect, useState } from 'react';

export interface StreamState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export type StreamListener<T> = (state: StreamState<T>) => void;

export interface SingletonStreamOptions<T> {
  initialData: T;
  graceMs?: number;
  start: (
    emit: (data: T) => void,
    emitError: (err: Error, partialData?: T) => void
  ) => () => void;
}

export interface SingletonStream<T> {
  subscribe: (listener: StreamListener<T>) => () => void;
  getState: () => StreamState<T>;
  peekData: () => { data: T; isLoaded: boolean };
  update: (updater: (prev: T) => T) => void;
  reset: () => void;
  use: () => StreamState<T>;
}

const activeStreamResetters = new Set<() => void>();

export function registerSingletonResetter(resetter: () => void) {
  activeStreamResetters.add(resetter);
}

export function resetAllSingletonStreams() {
  activeStreamResetters.forEach((reset) => {
    try {
      reset();
    } catch {}
  });
}

export function createSingletonStream<T>(
  options: SingletonStreamOptions<T>
): SingletonStream<T> {
  const { initialData, graceMs = 30_000, start } = options;

  let cachedData: T = initialData;
  let isLoaded = false;
  let globalError: Error | null = null;
  let activeUnsubscribe: (() => void) | null = null;
  let subscribersCount = 0;
  let tearDownTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<StreamListener<T>>();

  const notify = () => {
    const state: StreamState<T> = {
      data: cachedData,
      loading: !isLoaded,
      error: globalError,
    };
    listeners.forEach((listener) => listener(state));
  };

  const emit = (newData: T) => {
    cachedData = newData;
    isLoaded = true;
    globalError = null;
    notify();
  };

  const emitError = (err: Error, partialData?: T) => {
    if (partialData !== undefined) {
      cachedData = partialData;
    }
    isLoaded = true;
    globalError = err;
    notify();
  };

  const ensureStarted = () => {
    if (tearDownTimer) {
      clearTimeout(tearDownTimer);
      tearDownTimer = null;
    }
    if (activeUnsubscribe) return;
    activeUnsubscribe = start(emit, emitError);
  };

  const scheduleStop = () => {
    if (tearDownTimer) {
      clearTimeout(tearDownTimer);
    }
    tearDownTimer = setTimeout(() => {
      if (subscribersCount <= 0 && activeUnsubscribe) {
        try {
          activeUnsubscribe();
        } catch {}
        activeUnsubscribe = null;
      }
      tearDownTimer = null;
    }, graceMs);
  };

  const subscribe = (listener: StreamListener<T>): (() => void) => {
    subscribersCount++;
    listeners.add(listener);

    if (!activeUnsubscribe) {
      ensureStarted();
    } else {
      if (tearDownTimer) {
        clearTimeout(tearDownTimer);
        tearDownTimer = null;
      }
      if (isLoaded || globalError) {
        listener({
          data: cachedData,
          loading: !isLoaded,
          error: globalError,
        });
      }
    }

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      listeners.delete(listener);
      subscribersCount = Math.max(0, subscribersCount - 1);
      if (subscribersCount === 0) {
        scheduleStop();
      }
    };
  };

  const update = (updater: (prev: T) => T) => {
    cachedData = updater(cachedData);
    notify();
  };

  const reset = () => {
    if (tearDownTimer) {
      clearTimeout(tearDownTimer);
      tearDownTimer = null;
    }
    if (activeUnsubscribe) {
      try {
        activeUnsubscribe();
      } catch {}
      activeUnsubscribe = null;
    }
    cachedData = initialData;
    isLoaded = false;
    globalError = null;
    notify();
  };

  activeStreamResetters.add(reset);

  const use = (): StreamState<T> => {
    const [state, setState] = useState<StreamState<T>>(() => ({
      data: cachedData,
      loading: !isLoaded,
      error: globalError,
    }));

    useEffect(() => {
      return subscribe((next) => {
        setState(next);
      });
    }, []);

    return state;
  };

  return {
    subscribe,
    getState: () => ({
      data: cachedData,
      loading: !isLoaded,
      error: globalError,
    }),
    peekData: () => ({ data: cachedData, isLoaded }),
    update,
    reset,
    use,
  };
}

export function createKeyedSingletonStream<T>(
  factory: (key: string) => SingletonStreamOptions<T>
) {
  const streams = new Map<string, SingletonStream<T>>();

  const getOrCreate = (key: string): SingletonStream<T> => {
    let stream = streams.get(key);
    if (!stream) {
      stream = createSingletonStream(factory(key));
      streams.set(key, stream);
    }
    return stream;
  };

  return {
    getOrCreate,
    peek: (key: string) => streams.get(key)?.peekData() ?? null,
    resetAll: () => {
      streams.forEach((s) => s.reset());
      streams.clear();
    },
  };
}
