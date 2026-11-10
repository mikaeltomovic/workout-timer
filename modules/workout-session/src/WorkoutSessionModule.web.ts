import { registerWebModule, NativeModule } from 'expo';

// WorkoutSessionModule is not available on the web platform.
class WorkoutSessionModule extends NativeModule<Record<never, never>> {}

export default registerWebModule(WorkoutSessionModule, 'WorkoutSessionModule');
