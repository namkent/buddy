import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Script to restore dependencies on an offline machine.
 * It uses the bundled .pnpm-store to install without internet.
 */
async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const storeDir = path.join(rootDir, '.pnpm-store');
  const bundledModels = path.join(rootDir, 'bundled-models');

  console.log("🚀 Starting Comprehensive Offline Setup...");

  if (!fs.existsSync(storeDir)) {
    console.error("❌ Error: .pnpm-store directory not found!");
    process.exit(1);
  }

  try {
    // 1. Install dependencies
    console.log("\n📦 [1/2] Restoring dependencies and binaries from local store...");
    execSync(`pnpm install --offline`, { cwd: rootDir, stdio: 'inherit' });

    // 2. Restore AI models if bundled
    if (fs.existsSync(bundledModels)) {
      console.log("\n🤖 [2/2] Restoring AI models to storage...");
      const aiServiceDir = path.join(rootDir, 'ai-service');
      const envPath = path.join(aiServiceDir, '.env');
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const storageMatch = envContent.match(/STORAGE_DIR=(.*)/);
        const storageDir = storageMatch ? storageMatch[1].replace(/["']/g, '').trim() : 'storage';
        
        const modelsDest = path.resolve(aiServiceDir, storageDir, 'models');
        if (!fs.existsSync(modelsDest)) fs.mkdirSync(modelsDest, { recursive: true });

        console.log(`Copying models to ${modelsDest}...`);
        if (process.platform === 'win32') {
          execSync(`xcopy /E /I /Y "${bundledModels}" "${modelsDest}"`, { stdio: 'ignore' });
        } else {
          execSync(`cp -r "${bundledModels}/." "${modelsDest}"`);
        }
        console.log("✅ AI models restored.");
      }
    }

    console.log(`\n✅ SUCCESS! Project is ready for offline use.`);
  } catch (error) {
    console.error("\n❌ Offline setup failed:", error);
    process.exit(1);
  }
}

main();
