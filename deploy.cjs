const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const isWin = process.platform === 'win32';

console.log('1. Stopping Zotero...');
try {
  if (isWin) {
    execSync('Stop-Process -Name zotero -Force -ErrorAction SilentlyContinue', { shell: 'powershell.exe' });
  } else {
    execSync('pkill -f zotero || true', { shell: '/bin/sh' });
  }
} catch (e) {}

let retries = 10;
while (retries-- > 0) {
  try {
    const out = isWin
      ? execSync('Get-Process -Name zotero -ErrorAction SilentlyContinue', { shell: 'powershell.exe' }).toString()
      : execSync('pgrep -f zotero || true', { shell: '/bin/sh' }).toString();
    if (!out.trim()) break;
  } catch (e) {
    break;
  }
  const start = Date.now();
  while (Date.now() - start < 1000) {}
}
console.log('Zotero fully stopped.');

let profileDir = '';
if (isWin) {
  profileDir = 'C:\\Users\\Administrator\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\mmwnf28z.default';
} else {
  const zoteroProfilesDir = path.join(os.homedir(), '.zotero', 'zotero');
  if (fs.existsSync(zoteroProfilesDir)) {
    const entries = fs.readdirSync(zoteroProfilesDir);
    const defaultProf = entries.find(e => e.includes('default') && fs.statSync(path.join(zoteroProfilesDir, e)).isDirectory());
    if (defaultProf) {
      profileDir = path.join(zoteroProfilesDir, defaultProf);
    }
  }
}

const builtXpi = path.join(__dirname, '.scaffold', 'build', 'zotero-agy.xpi');

if (profileDir && fs.existsSync(profileDir)) {
  const extDir = path.join(profileDir, 'extensions');
  const stagedDir = path.join(extDir, 'staged');

  if (!fs.existsSync(stagedDir)) fs.mkdirSync(stagedDir, { recursive: true });

  console.log('2. Copying XPI files...');
  if (fs.existsSync(builtXpi)) {
    fs.copyFileSync(builtXpi, path.join(extDir, 'zotero-agy@antigravity.org.xpi'));
    fs.copyFileSync(builtXpi, path.join(stagedDir, 'zotero-agy@antigravity.org.xpi'));
  }

  console.log('3. Updating extensions.json...');
  const extJsonPath = path.join(profileDir, 'extensions.json');
  if (fs.existsSync(extJsonPath)) {
    try {
      const raw = fs.readFileSync(extJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const agy = parsed.addons.find(a => a.id === 'zotero-agy@antigravity.org');
      if (agy) {
        agy.version = pkg.version;
        agy.updateDate = Date.now();
        agy.active = true;
        agy.userDisabled = false;
        agy.appDisabled = false;
      }
      fs.writeFileSync(extJsonPath, JSON.stringify(parsed), 'utf8');
      console.log(`extensions.json safely parsed and updated with v${pkg.version}!`);
    } catch (e) {
      console.error('Error updating extensions.json:', e);
    }
  }

  console.log('4. Cleaning cache & lock files...');
  const lockFile = path.join(profileDir, 'parent.lock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch (e) {}
  }
  const addonStartup = path.join(profileDir, 'addonStartup.json.lz4');
  if (fs.existsSync(addonStartup)) {
    try { fs.unlinkSync(addonStartup); } catch (e) {}
  }
} else {
  console.log('No Zotero profile directory detected, skipping direct deployment.');
}

console.log('5. Launching Zotero with -purgecaches...');
try {
  if (isWin) {
    if (fs.existsSync('D:\\research\\zotero\\zotero.exe')) {
      spawn('D:\\research\\zotero\\zotero.exe', ['-purgecaches'], {
        cwd: 'D:\\research\\zotero',
        detached: true,
        stdio: 'ignore'
      }).unref();
      console.log('Zotero launched in background.');
    }
  } else {
    spawn('zotero', ['-purgecaches'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    console.log('Zotero launched in background on Linux.');
  }
} catch (e) {
  console.log('Note: Zotero could not be restarted automatically:', e.message);
}
