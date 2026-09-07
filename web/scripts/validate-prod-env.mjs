import { loadProductionEnv, validateBuiltBundle, validateProductionEnv } from './prod-env.mjs';

const values = loadProductionEnv();
const missing = validateProductionEnv(values);
if (missing.length > 0) {
  console.error(`Production configuration invalid or missing: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.argv.includes('--bundle')) {
  const absent = validateBuiltBundle(values);
  if (absent.length > 0) {
    console.error(`Production bundle does not contain required configuration: ${absent.join(', ')}`);
    process.exit(1);
  }
}
console.log(process.argv.includes('--bundle') ? 'Production bundle configuration: OK' : 'Production configuration: OK');
