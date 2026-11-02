import type { PipeMiddlewareMetadata } from './metadata-types.js';

/** An ordered, read-only sequence of middleware metadata entries for a pipe. */
export type PipeMetadataChain = readonly PipeMiddlewareMetadata[];
