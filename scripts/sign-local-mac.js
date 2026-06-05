const { spawnSync } = require('node:child_process');

const appPath = 'dist/mac-arm64/GoodCopy.app';
const installPath = '/Applications/GoodCopy.app';
const identity = process.env.GOODCOPY_SIGN_IDENTITY || '-';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (identity === '-') {
  console.warn(
    [
      'Warning: signing GoodCopy with an ad-hoc identity.',
      'macOS Accessibility permissions are tied to the code signature cdhash,',
      'so rebuilding the app may require removing/re-adding GoodCopy in System Settings.',
      'Set GOODCOPY_SIGN_IDENTITY to a stable local code signing identity to avoid this.'
    ].join(' ')
  );
}

run('codesign', ['--force', '--deep', '--sign', identity, appPath]);
run('ditto', [appPath, installPath]);
