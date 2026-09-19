import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../routes';
import { mount } from '../test/mount';
import { ROUTER_FUTURE } from '../routes';

jest.mock('../firebase', () => ({ auth: {} }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false }) }));

describe('unknown addresses (TEST round 1 D4)', () => {
  test.each(['/plants/whatever', '/x/y'])('%s renders a not-found page with a way home', (path) => {
    const { container, unmount } = mount(<MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}><AppRoutes /></MemoryRouter>);
    expect(container.textContent).toMatch(/page does not exist|no such page/i);
    expect(container.textContent).toContain(path);
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/');
    expect(links).toContain('/plants');
    unmount();
  });
});
