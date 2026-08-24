export type PipeDuplicatePolicy = 'allow' | 'reject';

export const pipeRelationshipKeys = ['after', 'before'] as const;

export type PipeRelationshipKey = (typeof pipeRelationshipKeys)[number];

declare const pipeCapabilityBrand: unique symbol;

export type PipeCapability<Id extends string = string, Shape extends object = object> = {
  readonly id: Id;
  readonly shape: Shape;
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
  readonly adds?: Adds;
  readonly after?: After;
  readonly before?: Before;
  readonly conflicts?: Conflicts;
  readonly duplicate?: Duplicate;
  readonly id: Id;
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
