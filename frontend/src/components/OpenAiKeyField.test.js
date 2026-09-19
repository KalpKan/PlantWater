import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import OpenAiKeyField from './OpenAiKeyField';
import { STORAGE_KEY } from '../openaiKey';

// React 18 + jsdom, no testing-library: mount into a div and drive events by hand.
function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, unmount: () => act(() => root.unmount()) };
}

function setValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => localStorage.clear());

describe('OpenAiKeyField', () => {
  test('saves a plausible key to localStorage only, shows a masked status, and removes it again', () => {
    const changes = [];
    const { container, unmount } = mount(<OpenAiKeyField onChange={(k) => changes.push(k)} />);
    expect(container.textContent).toContain('Use your own OpenAI key (optional)');
    expect(container.querySelector('[data-testid="openai-key-status"]')).toBeNull();

    const input = container.querySelector('[data-testid="openai-key-input"]');
    expect(input.getAttribute('type')).toBe('password');
    act(() => { setValue(input, 'sk-visitor-abcdefghijklmnop'); });
    act(() => { container.querySelector('[data-testid="openai-key-save"]').click(); });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-visitor-abcdefghijklmnop');
    expect(container.querySelector('[data-testid="openai-key-status"]').textContent).toBe('saved, ends in …mnop');
    expect(container.querySelector('[data-testid="openai-key-message"]').textContent).toContain('ends in …mnop');
    expect(container.textContent).not.toContain('sk-visitor-abcdefghijklmnop'); // the full key is never shown back
    expect(changes).toEqual(['sk-visitor-abcdefghijklmnop']);

    act(() => { container.querySelector('[data-testid="openai-key-remove"]').click(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(container.querySelector('[data-testid="openai-key-status"]')).toBeNull();
    expect(changes).toEqual(['sk-visitor-abcdefghijklmnop', '']);
    unmount();
  });

  test('refuses something that is not an OpenAI key and saves nothing', () => {
    const { container, unmount } = mount(<OpenAiKeyField />);
    const input = container.querySelector('[data-testid="openai-key-input"]');
    act(() => { setValue(input, 'someone@example.com'); });
    act(() => { container.querySelector('[data-testid="openai-key-save"]').click(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(container.querySelector('[data-testid="openai-key-message"]').textContent).toContain('does not look like an OpenAI API key');
    unmount();
  });
});
