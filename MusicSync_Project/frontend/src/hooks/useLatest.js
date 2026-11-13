import { useLayoutEffect, useRef } from 'react';

/** A ref that always holds the latest value, for callbacks that must not be re-created. */
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}
