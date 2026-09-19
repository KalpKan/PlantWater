// React 18 needs this flag in a plain jsdom + react-dom/client test setup, otherwise every
// act()-wrapped update prints "The current testing environment is not configured to support act(...)" (D13).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
