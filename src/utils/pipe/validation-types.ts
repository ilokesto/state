import type { PipeCapabilityChainValidation } from './capability-validation-types.js';
import type {
  PipeConflictForChain,
  PipeDuplicateMiddlewareDiagnostic,
  PipeHasDuplicateProblem,
} from './metadata-validation-types.js';
import type {
  PipeHasCycle,
  PipeHasOrderProblem,
  PipeMiddlewareCycleDiagnostic,
  PipeMiddlewareOrderDiagnostic,
} from './relationship-validation-types.js';
import type { PipeMiddlewareMetadata } from './metadata-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

/**
 * Validates a middleware chain, returning `unknown` when no problem is found.
 * Checks duplicate middleware first, then conflicts, capability requirements,
 * relationship cycles, and middleware order. The first failing category
 * determines the diagnostic type.
 *
 * @template Chain - Complete middleware chain to validate.
 * @template Current - Existing chain used to provide diagnostic context.
 * @template Next - Middleware being appended, used to provide diagnostic context.
 */
export type PipeMiddlewareChainValidation<
  Chain extends PipeMetadataChain,
  Current extends PipeMetadataChain = Chain,
  Next extends PipeMiddlewareMetadata = PipeMiddlewareMetadata,
> = PipeHasDuplicateProblem<Chain> extends true
  ? PipeDuplicateMiddlewareDiagnostic<Current, Next>
  : [PipeConflictForChain<Chain>] extends [never]
    ? PipeCapabilityChainValidation<Chain, Current, Next> extends infer CapabilityValidation
      ? unknown extends CapabilityValidation
        ? PipeHasCycle<Chain> extends true
          ? PipeMiddlewareCycleDiagnostic<Current, Next>
          : PipeHasOrderProblem<Chain> extends true
            ? PipeMiddlewareOrderDiagnostic<Current, Next>
            : unknown
        : CapabilityValidation
      : never
    : PipeConflictForChain<Chain>;

/**
 * Validates the chain formed by appending `Next` to `Current`, preserving both
 * types as diagnostic context. Resolves to `unknown` when the resulting chain
 * has no validation problem, or to the applicable diagnostic type otherwise.
 *
 * @template Current - Middleware chain before the append.
 * @template Next - Middleware metadata to append and validate.
 */
export type PipeMiddlewareAppendValidation<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeMiddlewareChainValidation<[...Current, Next], Current, Next>;

export type {
  PipeDuplicateCapabilityDiagnostic,
  PipeMissingCapabilityDiagnostic,
} from './capability-validation-types.js';
export type {
  PipeDuplicateMiddlewareDiagnostic,
  PipeMiddlewareConflictDiagnostic,
} from './metadata-validation-types.js';
export type {
  PipeMiddlewareCycleDiagnostic,
  PipeMiddlewareOrderDiagnostic,
} from './relationship-validation-types.js';
export type { PipeMetadataChain } from './validation-shared-types.js';
