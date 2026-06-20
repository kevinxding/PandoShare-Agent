import { CheckpointStore } from './CheckpointStore.js'

export type { CheckpointStatus, CreateCheckpointInput, KernelCheckpoint, PendingExternalEffect } from './CheckpointTypes.js'

// Compatibility wrapper. New code should access checkpoint operations through DurableRuntime.
export class CheckpointManager extends CheckpointStore {}
