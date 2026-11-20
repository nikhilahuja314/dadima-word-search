// Dev-only: prints 5 mandala plans as JSON.
import { createPlan } from '../../src/activities/mandala/plan/plan';

for (const seed of [1, 2, 3, 4, 5]) console.log(JSON.stringify(createPlan(seed), null, 2));
