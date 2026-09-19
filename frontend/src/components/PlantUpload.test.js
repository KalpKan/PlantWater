import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import PlantUpload from './PlantUpload';
import { mount } from '../test/mount';
import { ROUTER_FUTURE } from '../routes';

jest.mock('../firebase', () => ({ auth: { currentUser: { getIdToken: async () => 't' } } }));

function drop(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('PlantUpload rejects non-image files with a message (TEST round 1 D7)', () => {
  test('a .txt file produces an "Only ... images" message instead of silence', async () => {
    const { container, unmount } = mount(<MemoryRouter future={ROUTER_FUTURE}><PlantUpload /></MemoryRouter>);
    const input = container.querySelector('[data-testid="file-input"]');
    const file = new File([new Uint8Array(20000)], 'notes.txt', { type: 'text/plain' });
    await act(async () => { drop(input, file); await new Promise((r) => setTimeout(r, 50)); });
    expect(container.textContent).toMatch(/only .*images/i);
    expect(container.querySelector('[data-testid="identify"]').disabled).toBe(true);
    unmount();
  });
});
