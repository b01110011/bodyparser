/*
* @adonisjs/bodyparser
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

/// <reference path="../adonis-typings/index.ts" />

import { join } from 'path'
import { BodyParserConfigContract } from '@ioc:Adonis/Addons/BodyParser'
import { RequestConfigContract } from '@ioc:Adonis/Core/Request'

const contents = JSON.stringify(require('../package.json'), null, 2)

export const packageFilePath = join(__dirname, '../package.json')
export const packageFileSize = Buffer.from(contents, 'utf-8').length + 1
export const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time))

export const requestConfig: RequestConfigContract = {
  allowMethodSpoofing: false,
  trustProxy: () => true,
  subdomainOffset: 2,
  generateRequestId: false,
}

export const bodyParserConfig: BodyParserConfigContract = {
  whitelistedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  json: {
    encoding: 'utf-8',
    limit: '1mb',
    strict: true,
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },
  form: {
    encoding: 'utf-8',
    limit: '1mb',
    queryString: {},
    types: [
      'application/x-www-form-urlencoded',
    ],
  },
  raw: {
    encoding: 'utf-8',
    limit: '1mb',
    queryString: {},
    types: [
      'text/*',
    ],
  },
  multipart: {
    autoProcess: true,
    processManually: [],
    encoding: 'utf-8',
    maxFields: 1000,
    limit: '20mb',
    types: [
      'multipart/form-data',
    ],
  },
}