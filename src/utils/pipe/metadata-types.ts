/** Whether middleware with the same identifier may appear more than once. */
export type PipeDuplicatePolicy = 'allow' | 'reject';

export const pipeRelationshipKeys = ['after', 'before'] as const;

export type PipeRelationshipKey = (typeof pipeRelationshipKeys)[number];

declare const pipeCapabilityBrand: unique symbol;

/** Associates a capability identifier with the object shape it represents. */
export type PipeCapability<Id extends string = string, Shape extends object = object> = {
  /** Identifier used to distinguish this capability. */
  readonly id: Id;
  /** Object shape represented by this capability. */
  readonly shape: Shape;
  /** Optional nominal marker associating this capability with its identifier. */
  readonly [pipeCapabilityBrand]?: Id;
};

export type PipeMiddlewareMetadata<
  Id extends string = string,
  Requires extends readonly PipeCapability[] = readonly PipeCapability[],
  Adds extends readonly PipeCapability[] = readonly PipeCapability[],
  Duplicate extends PipeDuplicatePolicy = PipeDuplicatePolicy,
  Conflicts extends readonly string[] = readonly string[],
  Before extends readonly string[] = readonly string[],
  After extends readonly string[] = readonly string[],
> = {
  /** Capabilities contributed by this middleware. */
  readonly adds?: Adds;
  /** Middleware identifiers that this middleware should follow. */
  readonly after?: After;
  /** Middleware identifiers that this middleware should precede. */
  readonly before?: Before;
  /** Identifiers of middleware that cannot coexist with this middleware. */
  readonly conflicts?: Conflicts;
  /** Whether repeated occurrences of this middleware identifier are allowed. */
  readonly duplicate?: Duplicate;
  /** Identifier used for ordering, conflict checks, and duplicate handling. */
  readonly id: Id;
  /** Capabilities required by this middleware. */
  readonly requires?: Requires;
};

type PipeCapabilityShape<Capability extends PipeCapability> = Capability['shape'];

export type PipeCapabilityShapes<Capabilities extends readonly PipeCapability[]> =
  Capabilities extends readonly [
    infer First extends PipeCapability,
    ...infer Rest extends readonly PipeCapability[],
  ]
    ? PipeCapabilityShape<First> & PipeCapabilityShapes<Rest>
    : object;

export type PipeMetadataCapabilities<
  Metadata extends PipeMiddlewareMetadata,
  Key extends 'adds' | 'requires',
> = [Extract<Metadata[Key], readonly PipeCapability[]>] extends [never]
  ? readonly []
  : Extract<Metadata[Key], readonly PipeCapability[]>;

export type PipeCapabilitiesAfterAppend<
  Current extends readonly PipeCapability[],
  Next extends PipeMiddlewareMetadata,
> = [...Current, ...PipeMetadataCapabilities<Next, 'adds'>];
