import type { KeyboardEvent } from 'react';

/** Enter/Space activation for non-native interactive elements (divs used as buttons). */
export function onActivateKey(onClick: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
}
