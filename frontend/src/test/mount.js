import { act } from 'react';
import { createRoot } from 'react-dom/client';

// React 18 + jsdom, no testing-library: mount into a div and drive events by hand.
export function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => root.unmount()) };
}
