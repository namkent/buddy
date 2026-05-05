import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Script to bundle the project for offline deployment.
 * It ensures the pnpm store is populated and archives the project.
 */
async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const outputFile = 'mes-assistant-offline.zip';
  const npmrcPath = path.join(rootDir, '.npmrc');

  console.log("📦 Starting Comprehensive Offline Packaging...");

  try {
    // 1. Ensure .npmrc is set for local store and cache
    console.log("\n⚙️ [1/4] Configuring .npmrc for local isolation...");
    let npmrcContent = '';
    if (fs.existsSync(npmrcPath)) {
      npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
    }
    
    if (!npmrcContent.includes('store-dir')) npmrcContent += '\nstore-dir=.pnpm-store';
    if (!npmrcContent.includes('cache-dir')) npmrcContent += '\ncache-dir=.pnpm-cache';
    fs.writeFileSync(npmrcPath, npmrcContent.trim() + '\n');

    // 2. Fetch dependencies and binaries
    console.log("\n📥 [2/4] Fetching all dependencies and pre-built binaries...");
    // This will download things like sharp binaries (as @img/ packages) into .pnpm-store
    execSync(`pnpm install`, { cwd: rootDir, stdio: 'inherit' });

    // 3. Handle AI Models (Transformers.js)
    console.log("\n🤖 [3/4] Ensuring AI models are ready...");
    const aiServiceDir = path.join(rootDir, 'ai-service');
    if (fs.existsSync(aiServiceDir)) {
      try {
        console.log("Running download-models...");
        execSync(`pnpm run download-models`, { cwd: aiServiceDir, stdio: 'inherit' });
        
        // Find where they were downloaded (based on .env)
        const envPath = path.join(aiServiceDir, '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const storageMatch = envContent.match(/STORAGE_DIR=(.*)/);
        const storageDir = storageMatch ? storageMatch[1].replace(/["']/g, '').trim() : 'storage';
        
        const modelsSrc = path.resolve(aiServiceDir, storageDir, 'models');
        const modelsDest = path.join(rootDir, 'bundled-models');
        
        if (fs.existsSync(modelsSrc)) {
           console.log(`Found models at ${modelsSrc}. Bundling them...`);
           if (fs.existsSync(modelsDest)) fs.rmSync(modelsDest, { recursive: true, force: true });
           // Copy models to a local folder to be included in zip
           // Using internal tools or shell copy
           if (process.platform === 'win32') {
             execSync(`xcopy /E /I /Y "${modelsSrc}" "${modelsDest}"`, { stdio: 'ignore' });
           } else {
             execSync(`cp -r "${modelsSrc}" "${modelsDest}"`);
           }
        }
      } catch (e) {
        console.warn("⚠️ Warning: Could not bundle AI models automatically.");
      }
    }

    // 4. Create Archive
    console.log(`\n📚 [4/4] Zipping project to ${outputFile}...`);
    const excludes = [
      'node_modules',
      '.git',
      '.next',
      '.pnpm-store.7z',
      outputFile,
      'dist',
      '.next',
      'out'
    ];
    
    const excludeFlags = excludes.map(e => `--exclude="${e}"`).join(' ');
    const cmd = `tar -acf ${outputFile} ${excludeFlags} .`;
    
    console.log(`Running: ${cmd}`);
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

    console.log(`\n✅ SUCCESS!`);
    console.log(`--------------------------------------------------`);
    console.log(`Offline package created: ${outputFile}`);
    console.log(`Includes: Project, .pnpm-store, .pnpm-cache, and bundled-models.`);
    console.log(`--------------------------------------------------`);

  } catch (error) {
    console.error("\n❌ Packaging failed:", error);
    process.exit(1);
  }
}

main();
