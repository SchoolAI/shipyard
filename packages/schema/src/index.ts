export type { Artifact, ArtifactType, PlanMetadata, StepCompletion } from './plan.js';
export { ArtifactSchema, getArtifactUrl, PlanMetadataSchema } from './plan.js';

export type { UrlEncodedPlan } from './url-encoding.js';
export {
  createPlanUrl,
  decodePlan,
  encodePlan,
  getPlanFromUrl,
} from './url-encoding.js';

export {
  getPlanMetadata,
  getStepCompletions,
  initPlanMetadata,
  isStepCompleted,
  setPlanMetadata,
  toggleStepCompletion,
} from './yjs-helpers.js';
