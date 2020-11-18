/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

/**
 * This is the main function. It resolves the specified reference to the corresponding
 * sha of the HEAD commit at `ref`.
 *
 * If the specified repository is private you have to provide a valid GitHub access token
 * either via `x-github-token` header or `GITHUB_TOKEN` parameter.
 *
 * @param {Request} request
 * Query parameters:
 * * `owner`: GitHub organization or user
 * * `repo`: GitHub repository name
 * * [`ref`=<default branch>] git reference (branch or tag name)
 * @returns {Promise<object>} result
 * @returns {string} result.sha the sha of the HEAD commit at `ref`
 * @returns {string} result.fqRef the fully qualified name of `ref`
 *                                (e.g. `refs/heads/<branch>` or `refs/tags/<tag>`)
 */
async function handleRequest(request) {

  const params = new URL(request.url).searchParams;

  const owner = params.get('owner');
  const repo = params.get('repo');
  const ref = params.get('ref');
  const token = params.get('GITHUB_TOKEN') || request.headers.get('x-github-token');

   const ts0 = Date.now();

  return resolve({
    owner,
    repo,
    ref,
    token,
  })
    .then((result) => {
      const ts1 = Date.now();
      //console.log(`duration: ${ts1 - ts0}ms`);

      if (result) {
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      } else {
        return new Response('ref not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        });
      }
    })
    .catch((err) => {
      if (err instanceof TypeError) {
        return new Response(err.message, {
          status: 400,
          headers: { 'content-type': 'text/plain' },
        });
      } else if (err.status) {
        const { status, message } = err;
        return new Response(`failed to fetch git repo info (status: ${status}, message: ${message})`, {
          status: status >= 500 && status <= 599 ? 502 : status,
          headers: { 'content-type': 'text/plain' },
        });
      } else {
        return new Response(`failed to fetch git repo info: ${err})`, {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        });
      }
    });
}

const resolve = async ({
  owner,
  repo,
  ref,
  token,
} = {}) => {
  if (!owner || !repo) {
    throw new TypeError('owner and repo are mandatory parameters');
  }

  const url = `https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`;
  const opts = { headers: {} };
  if (token) {
    // the git transfer protocol supports basic auth with any user name and the token as password
    opts.headers['Authorization'] = 'Basic ' + btoa(`any_user:${token}`);
  }

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    let err;
    if ((resp.status === 401 && !token)
      || (resp.status === 404)) {
      err = new Error(`repository not found: ${owner}/${repo}`);
      err.status = 404;
      throw err;
    }

    err = new Error(`failed to fetch git repo info (status: ${resp.status}, body: ${await resp.text()})`);
    err.status = resp.status;
    throw err;
  }

  /*
  const ab = await resp.arrayBuffer();
  const enc = new TextDecoder('utf-8');
  const data = enc.decode(ab);
  */
  const data = await resp.text();
  const searchTerms = [];
  if (ref) {
    if (ref.startsWith('refs/')) {
      // full ref name (e.g. 'refs/tags/v0.1.2')
      searchTerms.push(ref);
    } else {
      // short ref name, potentially ambiguous (e.g. 'main', 'v0.1.2')
      searchTerms.push(`refs/heads/${ref}`);
      searchTerms.push(`refs/tags/${ref}`);
    }
  }
  let lines = data.split('\n');
  if (lines.length < 3) {
    throw new Error(`corrupted response: ${lines}`);
  }
  if (!ref) {
    // extract default branch from 2nd header line
    searchTerms.push(lines[1].match(/symref=HEAD:(\S+)/)[1]);
  }
  // strip header
  lines = lines.slice(2);
  const result = lines.filter((row) => {
    const parts = row.split(' ');
    return parts.length === 2 && searchTerms.includes(parts[1]);
  }).map((row) => row.substr(4).split(' ')); // skip leading pkt-len (4 bytes) (https://git-scm.com/docs/protocol-common#_pkt_line_format)
  return result.length ? { sha: result[0][0], fqRef: result[0][1] } : null;
};