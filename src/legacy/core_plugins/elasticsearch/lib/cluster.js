/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import elasticsearch from '@elastic/elasticsearch';
import { get, set, isEmpty, cloneDeep, pick } from 'lodash';
import toPath from 'lodash/internal/toPath';
import Boom from 'boom';
import Bluebird from 'bluebird';

import filterHeaders from './filter_headers';
import { parseConfig } from './parse_config';

export class Cluster {
  constructor(config) {
    this._config = {
      ...config
    };
    this.errors = elasticsearch.errors;

    this._clients = new Set();
    this._client = this.createClient();
    this._noAuthClient = this.createClient(
      { auth: false },
      { ignoreCertAndKey: !this.getSsl().alwaysPresentCertificate }
    );

    return this;
  }

  callWithRequest = (req = {}, endpoint, clientParams = {}, options = {}) => {
    if (req.headers) {
      const filteredHeaders = filterHeaders(req.headers, this.getRequestHeadersWhitelist());
      set(clientParams, 'headers', filteredHeaders);
    }

    return callAPI(this._noAuthClient, endpoint, clientParams, options);
  }

  callWithInternalUser = (endpoint, clientParams = {}, options = {}) => {
    return callAPI(this._client, endpoint, clientParams, options);
  }

  getRequestHeadersWhitelist = () => getClonedProperty(this._config, 'requestHeadersWhitelist');

  getCustomHeaders = () => getClonedProperty(this._config, 'customHeaders');

  getRequestTimeout = () => getClonedProperty(this._config, 'requestTimeout');

  getHosts = () => getClonedProperty(this._config, 'hosts');

  getSsl = () => getClonedProperty(this._config, 'ssl');

  getClient = () => this._client;

  close() {
    for (const client of this._clients) {
      client.close();
    }

    this._clients.clear();
  }

  createClient = (configOverrides, parseOptions) => {
    const config = {
      ...this._getClientConfig(),
      ...configOverrides
    };

    const client = new elasticsearch.Client(parseConfig(config, parseOptions));
    // This is just for initial debugging
    client.on('response', (err, meta) => {
      console.log();
      console.log('Connection ID:', meta.connection.id);
      console.log('Request', meta.request);
      if (err) {
        console.log('Error', err);
      } else {
        console.log('Response', meta.response);
      }
      console.log();
    });
    this._clients.add(client);
    return client;
  }

  _getClientConfig = () => {
    return getClonedProperties(this._config, [
      'hosts',
      'ssl',
      'username',
      'password',
      'customHeaders',
      'plugins',
      'apiVersion',
      'keepAlive',
      'pingTimeout',
      'requestTimeout',
      'sniffOnStart',
      'sniffInterval',
      'sniffOnConnectionFault',
      'log'
    ]);
  }
}

function callAPI(client, endpoint, clientParams = {}, options = {}) {
  const wrap401Errors = options.wrap401Errors !== false;
  const clientPath = toPath(endpoint);
  const api = get(client, clientPath);

  let apiContext = get(client, clientPath.slice(0, -1));
  if (isEmpty(apiContext)) {
    apiContext = client;
  }

  if (!api) {
    throw new Error(`called with an invalid endpoint: ${endpoint}`);
  }

  const requestOptions = {
    requestTimeout: clientParams.requestTimeout,
    ignore: clientParams.ignore,
    maxRetries: clientParams.maxRetries
  };
  return Bluebird.resolve(api.call(apiContext, clientParams, requestOptions))
    .then((result) => (result && result.body) ? result.body : result)
    .catch((err) => {
      if (!wrap401Errors || err.statusCode !== 401) {
        return Promise.reject(err);
      }

      const boomError = Boom.boomify(err, { statusCode: err.statusCode });
      const wwwAuthHeader = get(err, 'body.error.header[WWW-Authenticate]');
      boomError.output.headers['WWW-Authenticate'] = wwwAuthHeader || 'Basic realm="Authorization Required"';

      throw boomError;
    });
}

function getClonedProperties(config, paths) {
  return cloneDeep(paths ? pick(config, paths) : config);
}

function getClonedProperty(config, path) {
  return cloneDeep(path ? get(config, path) : config);
}
