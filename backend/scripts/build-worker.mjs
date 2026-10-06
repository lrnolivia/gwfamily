import {build} from 'esbuild';
import {workerBuildOptions} from './worker-build-options.mjs';
await build(workerBuildOptions());
