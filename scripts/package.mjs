import { packager } from '@electron/packager';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const identity = process.env.MAC_SIGN_IDENTITY;
const keychainProfile = process.env.MAC_NOTARY_PROFILE;

if (keychainProfile && !identity?.startsWith('Developer ID Application:')) {
  throw new Error('Notarization requires MAC_SIGN_IDENTITY="Developer ID Application: …".');
}

const outputs = await packager({
  dir: root,
  name: 'TinyVJ',
  platform: 'darwin',
  arch: 'arm64',
  out: path.join(root, 'build', 'current'),
  overwrite: true,
  appBundleId: 'com.dpid.tinyvj',
  asar: true,
  ignore: [/^\/build(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/(?:README|CLAUDE|AGENTS)\.md$/],
  osxSign: {
    // An ad-hoc signature seals a local build; it is not Apple notarization.
    identity: identity || '-',
    identityValidation: Boolean(identity),
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    // Ad-hoc binaries have no Team ID, so hardened library validation cannot
    // match the app to its Electron framework. Keep hardened runtime enabled
    // for certificate-signed builds (the signing tool's default).
    ...(!identity ? { optionsForFile: () => ({ hardenedRuntime: false }) } : {}),
  },
  ...(keychainProfile ? { osxNotarize: { keychainProfile } } : {}),
});

console.log(`Built: ${path.join(outputs[0], 'TinyVJ.app')}`);
console.log(keychainProfile ? 'Signed and notarized.' : 'Local build; not notarized for distribution.');
