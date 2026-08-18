import { expect, test } from 'bun:test';

import { persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { withBrowserFakes } from './helpers/browserFakes';

type TokenState = {
  readonly token: string;
};

const decodeToken = (value: unknown): TokenState | null => {
  if (typeof value !== 'object' || value === null || !('token' in value)) return null;
  return typeof value.token === 'string' ? { token: value.token } : null;
};

test('Given JSON containing an equals sign, when cookie persistence writes and rehydrates it, then the token survives intact', () => {
  // Given
  withBrowserFakes<TokenState>(() => {
    const storageKey = 'cookie-equals-round-trip';
    const persistedState = { token: 'abc=' };
    const writer = pipe
      .use(persist({ cookie: storageKey, decode: decodeToken }))
      .create<TokenState>({ token: 'initial' });

    // When
    writer.setState(persistedState);
    const reader = pipe
      .use(persist({ cookie: storageKey, decode: decodeToken }))
      .create<TokenState>({ token: 'fallback' });

    // Then
    expect(reader.getState()).toEqual(persistedState);
  });
});

test('Given cookie-delimiter-sensitive state, when cookie persistence writes it, then the encoded payload round-trips', () => {
  // Given
  withBrowserFakes<TokenState>((_, __, { cookieDocument }) => {
    const storageKey = 'cookie-delimiter-round-trip';
    const persistedState = { token: 'semi; comma, space and equals=' };
    const serializedPayload = JSON.stringify({ state: persistedState, version: 0 });
    const writer = pipe
      .use(persist({ cookie: storageKey, decode: decodeToken }))
      .create<TokenState>({ token: 'initial' });

    // When
    writer.setState(persistedState);
    const reader = pipe
      .use(persist({ cookie: storageKey, decode: decodeToken }))
      .create<TokenState>({ token: 'fallback' });

    // Then
    expect(cookieDocument.getItem(storageKey)).toBe(encodeURIComponent(serializedPayload));
    expect(reader.getState()).toEqual(persistedState);
  });
});

test('Given an existing raw cookie payload, when cookie persistence rehydrates it, then legacy JSON remains readable', () => {
  // Given
  withBrowserFakes<TokenState>((_, __, { cookieDocument }) => {
    const storageKey = 'cookie-legacy-raw';
    const persistedState = { token: 'legacy%20=token' };
    cookieDocument.cookie = `${storageKey}=${JSON.stringify({ state: persistedState, version: 0 })}`;

    // When
    const reader = pipe
      .use(persist({ cookie: storageKey, decode: decodeToken }))
      .create<TokenState>({ token: 'fallback' });

    // Then
    expect(reader.getState()).toEqual(persistedState);
  });
});
