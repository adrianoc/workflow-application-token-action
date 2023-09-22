/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 188:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const jwt = __nccwpck_require__(321)
  , github = __nccwpck_require__(217)
  , core = __nccwpck_require__(778)
  , PrivateKey = __nccwpck_require__(742)
  , HttpsProxyAgent = __nccwpck_require__(56)
  , url = __nccwpck_require__(310)
  ;

module.exports.create = (privateKey, applicationId, baseApiUrl, timeout, proxy) => {
  const app = new GitHubApplication(privateKey, applicationId, baseApiUrl);

  return app.connect(timeout, proxy)
    .then(() => {
      return app;
    });
}

class GitHubApplication {

  constructor(privateKey, applicationId, baseApiUrl) {
    this._config = {
      privateKey: new PrivateKey(_validateVariableValue('privateKey', privateKey)),
      id: _validateVariableValue('applicationId', applicationId),
    };

    this._githubApiUrl = baseApiUrl;
    this._client = null;
  }

  connect(validSeconds, proxy) {
    const self = this
      , secondsNow = Math.floor(Date.now() / 1000)
      , expireInSeconds = validSeconds || 60
      ;

    const payload = {
      iat: secondsNow,
      exp: secondsNow + expireInSeconds,
      iss: this.id,
    };

    const token = jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });

    // We need to get this here so we can potentially apply no_proxy rules
    const baseUrl = getApiBaseUrl(this.githubApiBaseUrl);

    const octokitOptions = {
      baseUrl: baseUrl
    };

    const request = {
      agent: getProxyAgent(proxy, baseUrl),
      timeout: 5000
    };
    octokitOptions.request = request;
    this._client = new github.getOctokit(token, octokitOptions);

    return this.client.request('GET /app', {
      mediaType: {
        previews: ['machine-man']
      }
    }).catch(err => {
      throw new Error(`Failed to connect as application; status code: ${err.status}\n${err.message}`);
    }).then(resp => {
      if (resp.status === 200) {
        // Store the metadata for debug purposes
        self._metadata = resp.data;

        return resp.data;
      } else {
        throw new Error(`Failed to load application with id:${this.id}; ${resp.data}`);
      }
    });
  }

  get githubApiBaseUrl() {
    return this._githubApiUrl;
  }

  get metadata() {
    return this._metadata;
  }

  get client() {
    const client = this._client;
    if (client === null) {
      throw new Error('Application has not been initialized correctly, call connect() to connect to GitHub first.');
    }
    return client;
  }

  get privateKey() {
    return this._config.privateKey.key;
  }

  get id() {
    return this._config.id;
  }

  get name() {
    return this._metadata.name;
  }

  getApplicationInstallations() {
    return this.client.request('GET /app/installations', {
      mediaType: {
        previews: ['machine-man']
      }
    }).catch(err => {
      throw new Error(`Failed to get application installations; ${err.message}`);
    }).then(resp => {
      if (resp.status === 200) {
        return resp.data;
      }
      throw new Error(`Unexpected status code ${resp.status}; ${resp.data}`);
    });
  }

  getRepositoryInstallation(owner, repo) {
    return this.client.rest.apps.getRepoInstallation({
      owner: owner,
      repo: repo
    }).catch(err => {
      throw new Error(`Failed to resolve installation of application on repository ${owner}/${repo}; ${err.message}`);
    }).then(resp => {
      if (resp.status === 200) {
        return resp.data;
      }
      throw new Error(`Unexpected status code ${resp.status}; ${resp.data}`);
    });
  }

  getOrganizationInstallation(org) {
    return this.client.rest.apps.getOrgInstallation({
      org: org
    }).catch(err => {
      throw new Error(`Failed to resolve installation of application on organization ${org}; ${err.message}`);
    }).then(resp => {
      if (resp.status === 200) {
        return resp.data;
      }
      throw new Error(`Unexpected status code ${resp.status}; ${resp.data}`);
    });
  }

  getInstallationAccessToken(installationId, permissions) {
    if (!installationId) {
      throw new Error('GitHub Application installation id must be provided');
    }

    permissions = permissions || {};
    const additional = {};
    if (Object.keys(permissions).length > 0) {
      additional.permissions = permissions;
    }

    return this.client.request(`POST /app/installations/${installationId}/access_tokens`, {
      mediaType: {
        previews: ['machine-man']
      },
      ...additional
    }).catch(err => {
      throw new Error(`Failed to get access token for application installation; ${err.message}`);
    }).then(resp => {
      if (resp.status === 201) {
        return resp.data;
      }
      throw new Error(`Unexpected status code ${resp.status}; ${resp.data}`);
    });
  }
}

function _validateVariableValue(variableName, value) {
  if (!value) {
    throw new Error(`A valid ${variableName} must be provided, was "${value}"`);
  }

  const result = `${value}`.trim();
  if (result.length === 0) {
    throw new Error(`${variableName} must be provided contained no valid characters other than whitespace`)
  }
  return result;
}

function getProxyAgent(proxy, baseUrl) {
  if (proxy) {
    // User has an explict proxy set, use it
    core.info(`explicit proxy specified as '${proxy}'`);
    return new HttpsProxyAgent(proxy);
  } else {
    // When loading from the environment, also respect no_proxy settings
    const envProxy = process.env.http_proxy
      || process.env.HTTP_PROXY
      || process.env.https_proxy
      || process.env.HTTPS_PROXY
      ;

    if (envProxy) {
      core.info(`environment proxy specified as '${envProxy}'`);

      const noProxy = process.env.no_proxy || process.env.NO_PROXY;
      if (noProxy) {
        core.info(`environment no_proxy set as '${noProxy}'`);
        if (proxyExcluded(noProxy, baseUrl)) {
          core.info(`environment proxy excluded from no_proxy settings`);
        } else {
          core.info(`using proxy '${envProxy}' for GitHub API calls`)
          return new HttpsProxyAgent(envProxy);
        }
      }
    }
  }
  return null;
}

function proxyExcluded(noProxy, baseUrl) {
  if (noProxy) {
    const noProxyHosts = noProxy.split(',').map(part => part.trim());
    const baseUrlHost = url.parse(baseUrl).host;

    core.debug(`noProxyHosts = ${JSON.stringify(noProxyHosts)}`);
    core.debug(`baseUrlHost = ${baseUrlHost}`);

    return noProxyHosts.indexOf(baseUrlHost) > -1;
  }
}

function getApiBaseUrl(url) {
  return url || process.env['GITHUB_API_URL'] || 'https://api.github.com'
}

/***/ }),

/***/ 742:
/***/ ((module) => {

module.exports = class PrivateKey {

  constructor(data) {
    if (isRsaPrivateKey(data)) {
      this._key = data ;
    }

    // Try to decode as Base64 key
    const decoded = decodeData(data);
    if (decoded) {
      this._key = decoded;
    }

    if (!this._key) {
      throw new Error(`Unsupported private key data format, need raw key in PEM format or Base64 encoded string.`);
    }
  }

  get key() {
    return this._key;
  }
}

function decodeData(data) {
  const decoded = Buffer.from(data, 'base64').toString('ascii');

  if (isRsaPrivateKey(decoded)) {
    return decoded;
  }

  return null;
}

function isRsaPrivateKey(data) {
  const possibleKey = `${data}`.trim();
  return /^-----BEGIN RSA PRIVATE KEY-----/.test(possibleKey) && /-----END RSA PRIVATE KEY-----$/.test(possibleKey);
}

/***/ }),

/***/ 778:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 217:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 56:
/***/ ((module) => {

module.exports = eval("require")("https-proxy-agent");


/***/ }),

/***/ 321:
/***/ ((module) => {

module.exports = eval("require")("jsonwebtoken");


/***/ }),

/***/ 310:
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(778)
  , githubApplication = __nccwpck_require__(188)
  ;

async function run() {
  let app;

  try {
    const privateKey = getRequiredInputValue('application_private_key')
      , applicationId = getRequiredInputValue('application_id')
      , githubApiBaseUrl = core.getInput('github_api_base_url')
      , httpsProxy = core.getInput('https_proxy')
      ;
    app = await githubApplication.create(privateKey, applicationId, githubApiBaseUrl, null, httpsProxy);
  } catch(err) {
    fail(err, 'Failed to initialize GitHub Application connection using provided id and private key');
  }

  if (app) {
    core.info(`TEST ADRIANO`);
    
    core.info(`Found GitHub Application: ${app.name}`);

    try {
      const userSpecifiedOrganization = core.getInput('organization')
        , repository = process.env['GITHUB_REPOSITORY']
        , repoParts = repository.split('/')
      ;

      let installationId;

      if (userSpecifiedOrganization) {
        core.info(`Obtaining application installation for organization: ${userSpecifiedOrganization}`);

        // use the organization specified to get the installation
        const installation = await app.getOrganizationInstallation(userSpecifiedOrganization);
        if (installation && installation.id) {
          installationId = installation.id;
        } else {
          fail(null, `GitHub Application is not installed on the specified organization: ${userSpecifiedOrganization}`);
        }
      } else {
        core.info(`Obtaining application installation for repository: ${repository}`);

        // fallback to getting a repository installation
        const installation = await app.getRepositoryInstallation(repoParts[0], repoParts[1]);
        if (installation && installation.id) {
          installationId = installation.id;
        } else {
          fail(null, `GitHub Application is not installed on repository: ${repository}`);
        }
      }

      if (installationId) {
        const permissions = {};
        // Build up the list of requested permissions
        let permissionInput = core.getInput("permissions");
        if (permissionInput) {
          for (let p of permissionInput.split(",")){
            let [pName, pLevel] = p.split(":", 2);
            permissions[pName.trim()] = pLevel.trim();
          }
          core.info(`Requesting limitation on GitHub Application permissions to only: ${JSON.stringify(permissions)}`);
        }

        const accessToken = await app.getInstallationAccessToken(installationId, permissions);

        // Register the secret to mask it in the output
        core.setSecret(accessToken.token);
        core.setOutput('token', accessToken.token);
        core.info(JSON.stringify(accessToken));
        core.info(`Successfully generated an access token for application.`)
      } else {
        fail('No installation of the specified GitHub application was able to be retrieved.');
      }
    } catch (err) {
      fail(err);
    }
  }
}
run();

function fail(err, message) {
  core.error(err);

  if (message) {
    core.setFailed(message);
  } else {
    core.setFailed(err.message);
  }
}

function getRequiredInputValue(key) {
  return core.getInput(key, {required: true});
}

})();

module.exports = __webpack_exports__;
/******/ })()
;