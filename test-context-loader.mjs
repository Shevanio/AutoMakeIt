/**
 * Test script to verify app_spec.txt symlink is loaded by loadContextFiles
 */

import { loadContextFiles } from './libs/utils/dist/context-loader.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectPath = __dirname;

console.log('🔍 Testing loadContextFiles...\n');
console.log(`Project path: ${projectPath}\n`);

try {
  const result = await loadContextFiles({ projectPath });

  console.log(`✅ Loaded ${result.files.length} context file(s):\n`);

  result.files.forEach((file, idx) => {
    console.log(`${idx + 1}. ${file.name}`);
    console.log(`   Path: ${file.path}`);
    console.log(`   Description: ${file.description || 'N/A'}`);
    console.log(`   Content size: ${file.content.length} bytes`);
    console.log();
  });

  if (result.files.some((f) => f.name === 'app_spec.txt')) {
    console.log('✅ SUCCESS: app_spec.txt is loaded via symlink!');
    console.log('\n📄 First 500 chars of app_spec.txt:');
    const appSpec = result.files.find((f) => f.name === 'app_spec.txt');
    console.log(appSpec.content.substring(0, 500));
  } else {
    console.log('❌ FAIL: app_spec.txt NOT loaded');
  }

  console.log('\n📝 Formatted Prompt Preview (first 1000 chars):');
  console.log(result.formattedPrompt.substring(0, 1000));
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
