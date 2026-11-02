import type { Store } from '@ilokesto/store';
import type {
  PipeCapabilitiesAfterAppend,
  PipeCapability,
  PipeCapabilityShapes,
  PipeMetadataCapabilities,
  PipeMiddlewareMetadata,
} from './metadata-types.js';
import type { PipeableMiddleware } from './pipeable-types.js';
import type { PipeMiddlewareAppendValidation } from './validation-types.js';

export { pipeRelationshipKeys } from './metadata-types.js';
export type {
  PipeCapabilitiesAfterAppend,
  PipeCapability,
  PipeCapabilityShapes,
  PipeDuplicatePolicy,
  PipeMetadataCapabilities,
  PipeMiddlewareMetadata,
  PipeRelationshipKey,
} from './metadata-types.js';

type PipeMetadataFor<Middleware> = Middleware extends PipeableMiddleware<
  object,
  infer Metadata extends PipeMiddlewareMetadata,
  'pipe' | 'persist-decoder'
>
  ? Metadata
  : never;

export type PipeRegisteredMetadataFor<Middleware> = Extract<
  PipeMetadataFor<Middleware>,
  PipeMiddlewareMetadata
>;

export type PipeMiddlewareValidationFor<
  MetadataChain extends readonly PipeMiddlewareMetadata[],
  Middleware,
> = Middleware extends PipeableMiddleware<
  object,
  PipeMiddlewareMetadata,
  'pipe' | 'persist-decoder'
>
  ? Middleware extends PipeableMiddleware<
      object,
      infer Metadata extends PipeMiddlewareMetadata,
      'pipe' | 'persist-decoder'
    >
    ? PipeMiddlewareAppendValidation<MetadataChain, Metadata>
    : never
  : {
      /** Identifies middleware that lacks recognized pipe metadata. */
      readonly __pipeUntaggedMiddlewareError: '__pipeUntaggedMiddlewareError';
      /** The rejected middleware type. */
      readonly middleware: Middleware;
      /** Optional unique-symbol brand distinguishing this diagnostic structurally. */
      readonly [pipeUntaggedMiddlewareDiagnosticBrand]?: '__pipeUntaggedMiddlewareError';
    };

declare const pipeUntaggedMiddlewareDiagnosticBrand: unique symbol;

export type PipeNextState<Current, Middleware> = Middleware extends PipeableMiddleware<
  PipeAnyMiddleware<infer Requires, infer Adds>,
  infer Metadata extends PipeMiddlewareMetadata,
  'pipe' | 'persist-decoder'
>
  ? [Requires, Adds, Metadata] extends [
      readonly PipeCapability[],
      readonly PipeCapability[],
      PipeMiddlewareMetadata,
    ]
    ? Current
    : never
  : Middleware extends PipeableMiddleware<
        PipeMiddleware<infer Next, infer Requires, infer Adds>,
        infer Metadata extends PipeMiddlewareMetadata,
        'pipe' | 'persist-decoder'
      >
    ? [Requires, Adds, Metadata] extends [
        readonly PipeCapability[],
        readonly PipeCapability[],
        PipeMiddlewareMetadata,
      ]
      ? PipeResolvedState<Current, Next>
      : never
    : never;

type PipeStateMismatchKind = 'pipe' | 'persist-decoder';

type PipeNextStateMismatchKind<
  CurrentKind extends PipeStateMismatchKind,
  Middleware,
> = Middleware extends PipeableMiddleware<
  PipeAnyMiddleware<infer Requires, infer Adds>,
  infer Metadata extends PipeMiddlewareMetadata,
  infer _MiddlewareKind
>
  ? [Requires, Adds, Metadata] extends [
      readonly PipeCapability[],
      readonly PipeCapability[],
      PipeMiddlewareMetadata,
    ]
    ? CurrentKind
    : never
  : Middleware extends PipeableMiddleware<
        PipeMiddleware<infer _Next, infer Requires, infer Adds>,
        infer Metadata extends PipeMiddlewareMetadata,
        infer MiddlewareKind
      >
    ? [Requires, Adds, Metadata] extends [
        readonly PipeCapability[],
        readonly PipeCapability[],
        PipeMiddlewareMetadata,
      ]
      ? CurrentKind extends 'persist-decoder'
        ? CurrentKind
        : MiddlewareKind
      : never
    : never;

export type PersistDecoderStateDiagnostic<DecodedState, StoreState> = {
  /** Identifies a mismatch between the decoded state and the store state. */
  readonly __persistDecoderStateError: '__persistDecoderStateError';
  /** The state type produced by the persistence decoder. */
  readonly decoded: DecodedState;
  /** The store state type that must be mutually assignable with the decoded state. */
  readonly state: StoreState;
};

type PersistDecoderStateValidation<DecodedState, StoreState> = [StoreState] extends [DecodedState]
  ? [DecodedState] extends [StoreState]
    ? unknown
    : PersistDecoderStateDiagnostic<DecodedState, StoreState>
  : PersistDecoderStateDiagnostic<DecodedState, StoreState>;

export type PipeStateAppendValidationFor<
  Current,
  CurrentKind extends PipeStateMismatchKind,
  Middleware,
> = Middleware extends PipeableMiddleware<
  PipeAnyMiddleware<infer Requires, infer Adds>,
  infer Metadata extends PipeMiddlewareMetadata,
  'pipe' | 'persist-decoder'
>
  ? [Requires, Adds, Metadata] extends [
      readonly PipeCapability[],
      readonly PipeCapability[],
      PipeMiddlewareMetadata,
    ]
    ? unknown
    : never
  : Middleware extends PipeableMiddleware<
        PipeMiddleware<infer Next, infer Requires, infer Adds>,
        infer Metadata extends PipeMiddlewareMetadata,
        infer MiddlewareKind
      >
    ? [Requires, Adds, Metadata] extends [
        readonly PipeCapability[],
        readonly PipeCapability[],
        PipeMiddlewareMetadata,
      ]
      ? unknown extends Current
        ? unknown
        : CurrentKind extends 'persist-decoder'
          ? PersistDecoderStateValidation<Current, Next>
          : MiddlewareKind extends 'persist-decoder'
            ? PersistDecoderStateValidation<Next, Current>
            : PipeStateAppendValidation<Current, Next>
      : never
    : never;

export type PipeMiddleware<
  State,
  Requires extends readonly PipeCapability[] = readonly [],
  Adds extends readonly PipeCapability[] = readonly [],
> = (
  store: Store<State> & PipeCapabilityShapes<Requires>,
) => Store<State> & PipeCapabilityShapes<Adds>;

export type PipeAnyMiddleware<
  Requires extends readonly PipeCapability[] = readonly [],
  Adds extends readonly PipeCapability[] = readonly [],
> = <State>(
  store: Store<State> & PipeCapabilityShapes<Requires>,
) => Store<State> & PipeCapabilityShapes<Adds>;

export type PipeResolvedState<Current, Next> = unknown extends Current ? Next : Current;

export type PipeStateCompatibility<
  Current,
  Next,
  StateMismatchKind extends PipeStateMismatchKind = 'pipe',
> = unknown extends Current
  ? object
  : StateMismatchKind extends 'persist-decoder'
    ? PersistDecoderStateValidation<Current, Next>
    : [Next] extends [Current]
      ? object
      : PipeStateCompatibilityDiagnostic<Current, Next>;

export type PipeInitialStateValidation<NextState> = NextState extends Store<infer State>
  ? {
      /** Identifies an existing store passed where an initial state value is expected. */
      readonly __pipeStoreInputError: '__pipeStoreInputError';
      /** The state type extracted from the rejected store input. */
      readonly state: State;
    }
  : unknown;

declare const pipeStateDiagnosticBrand: unique symbol;

export type PipeStateCompatibilityDiagnostic<Current, Next> = {
  /** Identifies incompatible state types in a pipe operation. */
  readonly __pipeStateCompatibilityError: '__pipeStateCompatibilityError';
  /** The state type already established by the pipe. */
  readonly current: Current;
  /** The proposed state type being checked against the established state. */
  readonly next: Next;
  /** Optional unique-symbol brand distinguishing this diagnostic structurally. */
  readonly [pipeStateDiagnosticBrand]?: '__pipeStateCompatibilityError';
};

export type PipeStateAppendValidation<Current, Next> = unknown extends Current
  ? unknown
  : [Current] extends [Next]
    ? unknown
    : {
        /** Identifies middleware whose state requirement cannot accept the current state. */
        readonly __pipeStateCompatibilityError: '__pipeStateCompatibilityError';
        /** The established state type that must be assignable to the middleware's state type. */
        readonly current: Current;
        /** The state type required by the middleware being appended. */
        readonly next: Next;
        /** Optional unique-symbol brand distinguishing this diagnostic structurally. */
        readonly [pipeStateDiagnosticBrand]?: '__pipeStateCompatibilityError';
      };

export type PipeBuilder<
  State = unknown,
  Capabilities extends readonly PipeCapability[] = readonly [],
  MetadataChain extends readonly PipeMiddlewareMetadata[] = readonly [],
  StateMismatchKind extends PipeStateMismatchKind = 'pipe',
> = {
  /**
   * Creates a store from a compatible initial state value, exposing the capabilities
   * accumulated by the middleware chain. Rejects existing store inputs.
   */
  readonly create: <NextState = State>(
    initialState: NextState &
      PipeStateCompatibility<State, NextState, StateMismatchKind> &
      PipeInitialStateValidation<NextState>,
  ) => Store<PipeResolvedState<State, NextState>> & PipeCapabilityShapes<Capabilities>;
  /**
   * Appends registered middleware after validating its metadata and state requirements,
   * returning a builder with updated state, capabilities, and metadata history.
   */
  readonly use: {
    <Middleware extends object>(
      middleware: Middleware &
        PipeMiddlewareValidationFor<MetadataChain, Middleware> &
        PipeStateAppendValidationFor<State, StateMismatchKind, Middleware>,
    ): PipeBuilder<
      PipeNextState<State, Middleware>,
      PipeCapabilitiesAfterAppend<Capabilities, PipeRegisteredMetadataFor<Middleware>>,
      [...MetadataChain, PipeRegisteredMetadataFor<Middleware>],
      PipeNextStateMismatchKind<StateMismatchKind, Middleware>
    >;
  };
};

export type Pipe = {
  /**
   * Starts a middleware chain with registered middleware, deriving the builder's
   * initial state constraint, capabilities, and metadata history from that middleware.
   */
  readonly use: {
    <Middleware extends object>(
      middleware: Middleware & PipeMiddlewareValidationFor<readonly [], Middleware>,
    ): PipeBuilder<
      PipeNextState<unknown, Middleware>,
      PipeMetadataCapabilities<PipeRegisteredMetadataFor<Middleware>, 'adds'>,
      readonly [PipeRegisteredMetadataFor<Middleware>],
      PipeNextStateMismatchKind<'pipe', Middleware>
    >;
  };
};

export type {
  PipeDuplicateCapabilityDiagnostic,
  PipeDuplicateMiddlewareDiagnostic,
  PipeMetadataChain,
  PipeMiddlewareAppendValidation,
  PipeMiddlewareChainValidation,
  PipeMiddlewareCycleDiagnostic,
  PipeMiddlewareConflictDiagnostic,
  PipeMiddlewareOrderDiagnostic,
  PipeMissingCapabilityDiagnostic,
} from './validation-types.js';
