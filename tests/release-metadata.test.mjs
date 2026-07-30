import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const RELEASE = '0.3.0-beta.1';
const [indexHtml, gameJs, bootstrapJs, adapterJs, readme, changelog, packageJson, packageLock] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/game.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/theme-rain-bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/theme-rain-adapter.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../package-lock.json', import.meta.url), 'utf8').then(JSON.parse),
]);

describe('release metadata', () => {
  it('uses one v0.3.0-beta.1 version across package metadata and README', () => {
    assert.equal(packageJson.version, RELEASE);
    assert.equal(packageLock.version, RELEASE);
    assert.equal(packageLock.packages[''].version, RELEASE);
    assert.match(readme, /\*\*Version:\*\* v0\.3\.0-beta\.1/);
  });

  it('publishes a machine-readable release marker', () => {
    assert.match(indexHtml, /<meta name="stacklogic-version" content="0\.3\.0-beta\.1"\s*\/?>/);
  });

  it('cache-busts every shipped CSS and JavaScript entry asset with the release version', () => {
    for (const asset of ['style.css', 'theme.js', 'theme-renderer.js', 'game.js', 'room-client.js']) {
      assert.match(indexHtml, new RegExp(`${asset.replace('.', '\\.') }\\?v=${RELEASE.replaceAll('.', '\\.').replace('-', '\\-')}`));
    }

    assert.match(indexHtml, /room-client\.js\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);

    assert.match(gameJs, /theme-rain-bootstrap\.js\?v=0\.3\.0-beta\.1/);
    assert.match(bootstrapJs, /theme-rain-adapter\.js\?v=0\.3\.0-beta\.1/);
    assert.match(adapterJs, /theme-rain-controller\.js\?v=0\.3\.0-beta\.1/);
  });

  it('documents all beta releases and retains an Unreleased section', () => {
    assert.match(changelog, /## \[Unreleased\]/);
    assert.match(changelog, /## \[0\.3\.0-beta\.1\] - 2026-07-26/);
    assert.match(changelog, /## \[0\.2\.0-beta\.1\] - 2026-07-25/);
    assert.match(changelog, /## \[0\.1\.0-beta\.1\] - 2026-02-08/);
  });
});
