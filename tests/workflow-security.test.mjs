import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/pages.yml', import.meta.url),
  'utf8'
);

const [preamble, jobs = ''] = workflow.split('\njobs:');
const [testJob = '', deployJob = ''] = jobs.split('\n  deploy:');

describe('Pages workflow authority boundaries', () => {
  it('defaults the workflow and PR test job to read-only contents', () => {
    assert.match(preamble, /permissions:\n  contents: read/);
    assert.doesNotMatch(preamble, /pages: write|id-token: write/);
    assert.doesNotMatch(testJob, /pages: write|id-token: write/);
  });

  it('grants Pages and OIDC write authority only to the test-dependent deploy job', () => {
    assert.match(deployJob, /needs: test/);
    assert.match(deployJob, /permissions:\n      contents: read\n      pages: write\n      id-token: write/);
  });

  it('never deploys pull-request events', () => {
    assert.match(
      deployJob,
      /if: github\.ref == 'refs\/heads\/main'.*github\.event_name == 'push'.*github\.event_name == 'workflow_dispatch'/
    );
  });
});
