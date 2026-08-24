export type PipeTypeFixtureCase =
  | { readonly kind: 'valid' }
  | {
      readonly kind: 'invalid';
      readonly diagnosticCount: number;
      readonly expectedMarkers: readonly string[];
    }
  | { readonly kind: 'harness-error' }
  | { readonly kind: 'dist-valid' }
  | {
      readonly kind: 'dist-invalid';
      readonly diagnosticCount: number;
      readonly expectedMarkers: readonly string[];
    };

export const pipeTypeFixtureCases = {
  'dist-consumer': { kind: 'dist-valid' },
  'dist-consumer/public-invalid': {
    diagnosticCount: 8,
    expectedMarkers: [
      '__pipeCallableRootError',
      '__pipeMiddlewareOrderError',
      '__pipeStoreInputError',
    ],
    kind: 'dist-invalid',
  },
  'invalid-callable-root': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeCallableRootError'],
    kind: 'invalid',
  },
  'invalid-conflict': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeMiddlewareConflictError'],
    kind: 'invalid',
  },
  'invalid-cycle': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeMiddlewareCycleError'],
    kind: 'invalid',
  },
  'invalid-duplicate': {
    diagnosticCount: 2,
    expectedMarkers: ['__pipeDuplicateMiddlewareError'],
    kind: 'invalid',
  },
  'invalid-duplicate-capability': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeDuplicateCapabilityError'],
    kind: 'invalid',
  },
  'invalid-harness': { kind: 'harness-error' },
  'invalid-legacy-call': {
    diagnosticCount: 2,
    expectedMarkers: ['__pipeCallableRootError'],
    kind: 'invalid',
  },
  'invalid-missing-capability': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeMissingCapabilityError'],
    kind: 'invalid',
  },
  'invalid-order': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeMiddlewareOrderError'],
    kind: 'invalid',
  },
  'invalid-persist-chain': {
    diagnosticCount: 1,
    expectedMarkers: ['__persistMigrationChainError'],
    kind: 'invalid',
  },
  'invalid-persist-debounce-order': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeMiddlewareOrderError'],
    kind: 'invalid',
  },
  'invalid-persist-decoder-state': {
    diagnosticCount: 2,
    expectedMarkers: ['__persistDecoderStateError'],
    kind: 'invalid',
  },
  'invalid-persist-first-input': {
    diagnosticCount: 1,
    expectedMarkers: ['__persistMigrationChainError'],
    kind: 'invalid',
  },
  'invalid-persist-session-migrate': {
    diagnosticCount: 1,
    expectedMarkers: ['session'],
    kind: 'invalid',
  },
  'invalid-root-create': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeRootCreateError'],
    kind: 'invalid',
  },
  'invalid-state': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeStateCompatibilityError'],
    kind: 'invalid',
  },
  'invalid-store-input': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeStoreInputError'],
    kind: 'invalid',
  },
  'invalid-untagged-use': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeUntaggedMiddlewareError'],
    kind: 'invalid',
  },
  'invalid-validate-initial-state': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeStateCompatibilityError'],
    kind: 'invalid',
  },
  'invalid-validate-state': {
    diagnosticCount: 1,
    expectedMarkers: ['__pipeStateCompatibilityError'],
    kind: 'invalid',
  },
  'valid-builder': { kind: 'valid' },
  'valid-capabilities': { kind: 'valid' },
  'valid-conflicts': { kind: 'valid' },
  'valid-metadata': { kind: 'valid' },
  'valid-persist-safe': { kind: 'valid' },
  'valid-types': { kind: 'valid' },
  'valid-validate': { kind: 'valid' },
} as const satisfies Record<string, PipeTypeFixtureCase>;
