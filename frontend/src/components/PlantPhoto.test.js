import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PlantPhoto, { UNAVAILABLE_MESSAGE } from './PlantPhoto';

// React 18 + jsdom, no testing-library: mount into a div and drive events by hand.
function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => root.unmount()) };
}

const supabaseUrl = 'https://yzppfufqaekgaxcrsqxp.supabase.co/storage/v1/object/public/plantit-photos/u1/p1.jpg';

describe('PlantPhoto', () => {
  test('renders the real photo when the API gives a URL', () => {
    const { container, unmount } = mount(<PlantPhoto plant={{ species: 'Pothos', imageUrl: supabaseUrl, photoStatus: 'ok' }} />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe(supabaseUrl);
    expect(container.textContent).not.toContain('Photo no longer available');
    unmount();
  });

  test('shows the labelled placeholder instead of a broken image for a legacy Firebase photo', () => {
    const { container, unmount } = mount(<PlantPhoto plant={{ species: 'Pilea', imageUrl: null, photoStatus: 'unavailable' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(UNAVAILABLE_MESSAGE);
    expect(container.querySelector('[data-testid="photo-unavailable"]')).not.toBeNull();
    unmount();
  });

  test('falls back to the same placeholder when the photo URL fails to load (onError)', () => {
    const { container, unmount } = mount(<PlantPhoto plant={{ species: 'Fern', imageUrl: 'https://example.invalid/gone.jpg', photoStatus: 'ok' }} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(UNAVAILABLE_MESSAGE);
    unmount();
  });

  test('shows a neutral "no photo" placeholder when the plant never had one', () => {
    const { container, unmount } = mount(<PlantPhoto plant={{ species: 'Ficus', imageUrl: null, photoStatus: 'none' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('No photo');
    expect(container.textContent).not.toContain(UNAVAILABLE_MESSAGE);
    unmount();
  });
});
