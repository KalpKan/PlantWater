import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlantDetails from './PlantDetails';
import { mount } from '../test/mount';
import { ROUTER_FUTURE } from '../routes';

jest.mock('../firebase', () => ({ auth: { currentUser: { getIdToken: async () => 't' } } }));

const candidate = (name, score, common) => ({ score, species: { scientificNameWithoutAuthor: name, commonNames: common ? [common] : [], family: { scientificNameWithoutAuthor: 'Araceae' } } });
const care = { watering: 'w', light: 'l', temperature: 't', humidity: 'h', soil: 's', fertilizer: 'f', soilMoisture: { minVWC: 15, maxVWC: 45, optimalVWC: 30, wateringThreshold: 20 } };

function render(state) {
  return mount(
    <MemoryRouter initialEntries={[{ pathname: '/plant-details', state }]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/plant-details" element={<PlantDetails />} />
        <Route path="/add-plant" element={<div>add</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlantDetails low-confidence answers (TEST round 1 D3)', () => {
  test('a 10 % match shows a low-confidence warning and the runner-up candidates with their scores', () => {
    const { container, unmount } = render({
      candidates: [candidate('Livistona chinensis', 0.104, 'Chinese fan palm'), candidate('Monstera deliciosa', 0.09, 'Swiss cheese plant'), candidate('Philodendron pastazanum', 0.05), candidate('Rhaphidophora tetrasperma', 0.02)],
      careInstructions: care, careSource: 'generic', lowConfidence: true, savedPlant: { id: 'p1' },
    });
    const warning = container.querySelector('[data-testid="low-confidence-notice"]');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toMatch(/low confidence/i);
    expect(warning.textContent).toMatch(/10 ?%/);
    const others = container.querySelector('[data-testid="other-candidates"]');
    expect(others).not.toBeNull();
    expect(others.textContent).toContain('Monstera deliciosa');
    expect(others.textContent).toContain('Philodendron pastazanum');
    expect(others.textContent).toContain('Rhaphidophora tetrasperma');
    expect(others.textContent).toMatch(/9 ?%/);
    expect(container.textContent).not.toMatch(/Saved to your collection\. Open/); // the confident green banner is not the headline here
    unmount();
  });

  test('an 86 % match shows neither the warning nor the runner-up list', () => {
    const { container, unmount } = render({
      candidates: [candidate('Ficus lyrata', 0.86, 'Fiddle-leaf fig'), candidate('Ficus elastica', 0.03)],
      careInstructions: care, careSource: 'bundled', lowConfidence: false, savedPlant: { id: 'p1' },
    });
    expect(container.querySelector('[data-testid="low-confidence-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="other-candidates"]')).toBeNull();
    expect(container.textContent).toContain('Saved to your collection');
    unmount();
  });

  test('after a rejected visitor key the source line does not tell the visitor to add a key (D12)', () => {
    const { container, unmount } = render({
      candidates: [candidate('Aloe vera', 0.88, 'Aloe')], careInstructions: care, careSource: 'generic', careReason: 'openai_error', openaiError: 'invalid_key', savedPlant: { id: 'p1' },
    });
    const caption = container.querySelector('[data-testid="care-source"]');
    expect(caption.textContent).not.toMatch(/add your own OpenAI key/i);
    expect(caption.textContent).toMatch(/rejected/i);
    unmount();
  });
});
