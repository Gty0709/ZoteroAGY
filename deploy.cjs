const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

const isWin = process.platform === 'win32';

console.log('1. Checking running Zotero processes...');
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
console.log('Zotero stopped or not running.');

// Dynamically discover Zotero Profile Directory
let profileDir = '';
if (isWin) {
  const zoteroAppData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Zotero', 'Zotero');
  const profilesIni = path.join(zoteroAppData, 'profiles.ini');
  if (fs.existsSync(profilesIni)) {
    const iniContent = fs.readFileSync(profilesIni, 'utf8');
    const pathMatch = iniContent.match(/Path=(.+)/);
    if (pathMatch) {
      const relOrAbs = pathMatch[1].trim();
      profileDir = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(zoteroAppData, relOrAbs);
    }
  }
  if (!profileDir || !fs.existsSync(profileDir)) {
    const profilesFolder = path.join(zoteroAppData, 'Profiles');
    if (fs.existsSync(profilesFolder)) {
      const entries = fs.readdirSync(profilesFolder);
      const def = entries.find(e => e.includes('default') && fs.statSync(path.join(profilesFolder, e)).isDirectory()) || entries[0];
      if (def) profileDir = path.join(profilesFolder, def);
    }
  }
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

console.log(`Detected Profile Directory: ${profileDir || 'None'}`);

const builtXpi = path.join(__dirname, '.scaffold', 'build', 'zotero-agy.xpi');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// MozLz4 helpers
function decompressMozLz4(buffer) {
  const magic = buffer.subarray(0, 8).toString('utf8');
  if (magic !== 'mozLz40\0') {
    throw new Error('Not mozLz4');
  }
  const uncompressedSize = buffer.readUInt32LE(8);
  const out = Buffer.alloc(uncompressedSize);
  let srcPos = 12;
  let dstPos = 0;

  while (srcPos < buffer.length && dstPos < uncompressedSize) {
    const token = buffer[srcPos++];
    let literalLength = token >> 4;
    if (literalLength === 15) {
      let b = 255;
      while (b === 255 && srcPos < buffer.length) {
        b = buffer[srcPos++];
        literalLength += b;
      }
    }

    buffer.copy(out, dstPos, srcPos, srcPos + literalLength);
    dstPos += literalLength;
    srcPos += literalLength;

    if (dstPos >= uncompressedSize) break;

    const offset = buffer.readUInt16LE(srcPos);
    srcPos += 2;

    let matchLength = (token & 0x0f) + 4;
    if (matchLength === 19) {
      let b = 255;
      while (b === 255 && srcPos < buffer.length) {
        b = buffer[srcPos++];
        matchLength += b;
      }
    }

    let matchPos = dstPos - offset;
    for (let i = 0; i < matchLength; i++) {
      out[dstPos++] = out[matchPos++];
    }
  }

  return out.toString('utf8');
}

function compressMozLz4(uncompressedBuf) {
  const uncompressedSize = uncompressedBuf.length;
  const header = Buffer.alloc(12);
  header.write('mozLz40\0', 0, 8, 'utf8');
  header.writeUInt32LE(uncompressedSize, 8);

  const parts = [];
  let remaining = uncompressedSize;
  let offset = 0;

  if (remaining < 15) {
    parts.push(Buffer.from([remaining << 4]));
    parts.push(uncompressedBuf.subarray(offset, offset + remaining));
  } else {
    const extra = [];
    let rem = remaining - 15;
    while (rem >= 255) {
      extra.push(255);
      rem -= 255;
    }
    extra.push(rem);
    parts.push(Buffer.from([0xF0, ...extra]));
    parts.push(uncompressedBuf.subarray(offset, offset + remaining));
  }

  const compressedBlock = Buffer.concat(parts);
  return Buffer.concat([header, compressedBlock]);
}

if (profileDir && fs.existsSync(profileDir)) {
  const extDir = path.join(profileDir, 'extensions');
  const stagedDir = path.join(extDir, 'staged');

  if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
  if (!fs.existsSync(stagedDir)) fs.mkdirSync(stagedDir, { recursive: true });

  console.log('2. Copying XPI files to extensions and staged directories...');
  if (fs.existsSync(builtXpi)) {
    fs.copyFileSync(builtXpi, path.join(extDir, `${pkg.config.addonID}.xpi`));
    fs.copyFileSync(builtXpi, path.join(stagedDir, `${pkg.config.addonID}.xpi`));
    console.log(`Successfully copied ${pkg.config.addonID}.xpi`);
  } else {
    console.error(`Build output not found at ${builtXpi}`);
  }

  console.log('3. Updating extensions.json...');
  const extJsonPath = path.join(profileDir, 'extensions.json');
  if (fs.existsSync(extJsonPath)) {
    try {
      const raw = fs.readFileSync(extJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      const agy = parsed.addons.find(a => a.id === pkg.config.addonID);
      const targetApps = [
        {
          id: 'zotero@zotero.org',
          minVersion: '6.999',
          maxVersion: '11.*'
        }
      ];

      if (agy) {
        agy.version = pkg.version;
        agy.updateDate = Date.now();
        agy.active = true;
        agy.userDisabled = false;
        agy.appDisabled = false;
        agy.targetApplications = targetApps;
        console.log(`extensions.json updated existing entry for ${pkg.config.addonID} (v${pkg.version}, maxVersion: 11.*)!`);
      } else {
        const xpiDest = path.join(extDir, `${pkg.config.addonID}.xpi`);
        parsed.addons.push({
          id: pkg.config.addonID,
          syncGUID: `{${crypto.randomUUID()}}`,
          version: pkg.version,
          type: 'extension',
          loader: null,
          updateURL: `https://github.com/${pkg.author}/${pkg.name}/releases/download/release/update.json`,
          installOrigins: null,
          manifestVersion: 2,
          optionsURL: null,
          optionsType: null,
          optionsBrowserStyle: true,
          aboutURL: null,
          defaultLocale: {
            name: pkg.config.addonName,
            description: pkg.description,
            creator: pkg.author,
            homepageURL: pkg.homepage,
            developers: null,
            translators: null,
            contributors: null
          },
          visible: true,
          active: true,
          userDisabled: false,
          appDisabled: false,
          embedderDisabled: false,
          installDate: Date.now(),
          updateDate: Date.now(),
          applyBackgroundUpdates: 1,
          path: xpiDest,
          skinnable: false,
          sourceURI: null,
          releaseNotesURI: null,
          softDisabled: false,
          foreignInstall: false,
          strictCompatibility: true,
          locales: [],
          targetApplications: targetApps,
          targetPlatforms: [],
          signedState: 0,
          signedTypes: [],
          signedDate: null,
          seen: true,
          dependencies: [],
          incognito: 'spanning',
          userPermissions: { permissions: [], origins: [], data_collection: [] },
          optionalPermissions: { permissions: [], origins: [], data_collection: [] },
          requestedPermissions: { permissions: [], origins: [], data_collection: [] },
          icons: {
            "48": "content/icons/favicon@0.5x.png",
            "96": "content/icons/favicon.png"
          },
          iconURL: null,
          blocklistAttentionDismissed: false,
          blocklistState: 0,
          blocklistURL: null,
          startupData: null,
          hidden: false,
          installTelemetryInfo: { source: "about:addons", method: "install-from-file" },
          recommendationState: null,
          rootURI: `jar:file:///${xpiDest.replace(/\\/g, '/')}!/`,
          location: 'app-profile'
        });
        console.log(`extensions.json added new entry for ${pkg.config.addonID} (v${pkg.version}, maxVersion: 11.*)!`);
      }
      fs.writeFileSync(extJsonPath, JSON.stringify(parsed, null, 2), 'utf8');
    } catch (e) {
      console.error('Error updating extensions.json:', e);
    }
  }

  // 4. Update addonStartup.json.lz4 cache safely in-place without deleting any files
  console.log('4. Synchronizing addonStartup.json.lz4 cache (strictly preserving all files)...');
  const addonStartupFile = path.join(profileDir, 'addonStartup.json.lz4');
  if (fs.existsSync(addonStartupFile)) {
    try {
      const raw = decompressMozLz4(fs.readFileSync(addonStartupFile));
      const parsed = JSON.parse(raw);
      const addons = parsed['app-profile']?.addons || {};

      addons[pkg.config.addonID] = {
        blocklistState: 0,
        dependencies: [],
        enabled: true,
        lastModifiedTime: Date.now(),
        loader: null,
        path: `${pkg.config.addonID}.xpi`,
        recommendationState: null,
        rootURI: `jar:file:///${path.join(extDir, `${pkg.config.addonID}.xpi`).replace(/\\/g, '/')}!/`,
        runInSafeMode: false,
        signedState: 0,
        signedDate: null,
        telemetryKey: `${encodeURIComponent(pkg.config.addonID)}:${pkg.version}`,
        version: pkg.version
      };

      const newJson = JSON.stringify(parsed);
      const newLz4 = compressMozLz4(Buffer.from(newJson, 'utf8'));
      fs.writeFileSync(addonStartupFile, newLz4);
      console.log(`addonStartup.json.lz4 successfully synchronized with ${pkg.config.addonID}!`);
    } catch (e) {
      console.error('Error updating addonStartup.json.lz4:', e.message);
    }
  }

  // 5. Update prefs.js
  const prefsPath = path.join(profileDir, 'prefs.js');
  if (fs.existsSync(prefsPath)) {
    try {
      let prefsContent = fs.readFileSync(prefsPath, 'utf8');
      const uuidMatch = prefsContent.match(/user_pref\("extensions\.webextensions\.uuids", "(.*)"\);/);
      if (uuidMatch) {
        const escapedJson = uuidMatch[1].replace(/\\"/g, '"');
        const uuids = JSON.parse(escapedJson);
        if (!uuids[pkg.config.addonID]) {
          uuids[pkg.config.addonID] = crypto.randomUUID();
          const newEscaped = JSON.stringify(uuids).replace(/"/g, '\\"');
          prefsContent = prefsContent.replace(uuidMatch[0], `user_pref("extensions.webextensions.uuids", "${newEscaped}");`);
          fs.writeFileSync(prefsPath, prefsContent, 'utf8');
          console.log(`prefs.js assigned WebExtension UUID to ${pkg.config.addonID}`);
        }
      }
    } catch (e) {
      console.log('Error updating prefs.js UUID:', e.message);
    }
  }

} else {
  console.log('No Zotero profile directory detected, skipping direct deployment.');
}

// Find Zotero binary
console.log('5. Searching for Zotero binary...');
let zoteroBin = '';
const candidateBins = [
  'F:\\Programs\\Zotero\\zotero.exe',
  'C:\\Program Files\\Zotero\\zotero.exe',
  'C:\\Program Files (x86)\\Zotero\\zotero.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Zotero', 'zotero.exe'),
  path.join(process.env.ProgramFiles || '', 'Zotero', 'zotero.exe'),
  'D:\\research\\zotero\\zotero.exe'
];

for (const b of candidateBins) {
  if (fs.existsSync(b)) {
    zoteroBin = b;
    break;
  }
}

if (!zoteroBin && !isWin) {
  zoteroBin = 'zotero';
}

if (zoteroBin) {
  console.log(`Found Zotero binary: ${zoteroBin}`);
  console.log('6. Launching Zotero...');
  try {
    const child = spawn(zoteroBin, [], {
      cwd: path.dirname(zoteroBin),
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    console.log('Zotero launched successfully in background.');
  } catch (e) {
    console.log('Note: Zotero could not be restarted automatically:', e.message);
  }
} else {
  console.log('Zotero binary not found automatically. Please start Zotero manually.');
}
