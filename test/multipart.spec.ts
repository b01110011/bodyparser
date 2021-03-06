/*
* @adonisjs/bodyparser
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

/// <reference path="../adonis-typings/bodyparser.ts" />

import test from 'japa'
import { join } from 'path'
import supertest from 'supertest'
import { createServer } from 'http'
import { pathExists, remove, createWriteStream } from 'fs-extra'
import { Encryption } from '@adonisjs/encryption/build/standalone'
import { RequestConstructorContract } from '@ioc:Adonis/Core/Request'
import { Request as BaseRequest } from '@adonisjs/http-server/build/src/Request'

import { Multipart } from '../src/Multipart'
import { File } from '../src/Multipart/File'
import {
  sleep,
  getLogger,
  requestConfig,
  packageFilePath,
  packageFileSize,
} from '../test-helpers'

const encryption = new Encryption({
  secret: 'verylongandrandom32charsecretkey',
})
const Request = BaseRequest as unknown as RequestConstructorContract

test.group('Multipart', () => {
  test('process file by attaching handler on field name', async (assert) => {
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('data', (line) => {
            reporter(line)
          })
          part.on('error', reject)
          part.on('end', resolve)
        })
      })

      await multipart.process()
      files = request['__raw_files']
      res.end()
    })

    await supertest(server).post('/').attach('package', packageFilePath)
    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.equal(files!.package.size, packageFileSize)
  })

  test('error inside onFile handler should propogate to file errors', async (assert) => {
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, (part, reporter) => {
        return new Promise((_resolve, reject) => {
          part.on('data', (line) => {
            reporter(line)
          })
          part.on('error', reject)
          reject(Error('Cannot process'))
        })
      })

      await multipart.process()
      files = request['__raw_files'] || null
      res.end()
    })

    await supertest(server).post('/').attach('package', packageFilePath)
    assert.property(files, 'package')
    assert.isFalse(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.deepEqual(files!.package.errors, [{
      fieldName: 'package',
      clientName: 'package.json',
      message: 'Cannot process',
      type: 'fatal',
    }])
  })

  test('wait for promise to return even when part has been streamed', async (assert) => {
    let files: null | { [key: string]: File } = null
    const stack: string[] = []

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, async (part, reporter) => {
        part.on('data', (line) => {
          reporter(line)
        })

        stack.push('before')
        part.resume()
        await sleep(100)
        stack.push('after')
      })

      await multipart.process()
      files = request['__raw_files']
      stack.push('ended')
      res.end()
    })

    await supertest(server).post('/').attach('package', packageFilePath)
    assert.deepEqual(stack, ['before', 'after', 'ended'])
    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.equal(files!.package.size, packageFileSize)
  })

  test('work fine when stream is piped to a destination', async (assert) => {
    const SAMPLE_FILE_PATH = join(__dirname, './sample.json')
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('data', (line) => {
            reporter(line)
          })

          part.on('error', reject)
          part.on('end', resolve)
          part.pipe(createWriteStream(SAMPLE_FILE_PATH))
        })
      })

      await multipart.process()
      files = request['__raw_files']

      const hasFile = await pathExists(SAMPLE_FILE_PATH)
      res.end(String(hasFile))
    })

    const { text } = await supertest(server).post('/').attach('package', packageFilePath)

    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.equal(files!.package.size, packageFileSize)
    assert.equal(files!.package.state, 'consumed')
    assert.equal(text, 'true')

    await remove(SAMPLE_FILE_PATH)
  })

  test('work fine with array of files', async (assert) => {
    const stack: string[] = []
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, async (part, reporter) => {
        part.on('data', reporter)

        stack.push('before')
        part.resume()
        await sleep(100)
        stack.push('after')
      })

      await multipart.process()
      files = request['__raw_files']
      stack.push('ended')
      res.end()
    })

    await supertest(server).post('/').attach('package[]', packageFilePath)

    assert.deepEqual(stack, ['before', 'after', 'ended'])
    assert.property(files, 'package')
    assert.isTrue(files!.package[0].isValid)
    assert.equal(files!.package[0].state, 'consumed')
    assert.equal(files!.package[0].size, packageFileSize)
  })

  test('work fine with indexed array of files', async (assert) => {
    const stack: string[] = []
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('package', {}, async (part, reporter) => {
        part.on('data', reporter)

        stack.push('before')
        part.resume()
        await sleep(100)
        stack.push('after')
      })

      await multipart.process()
      files = request['__raw_files']
      stack.push('ended')
      res.end()
    })

    await supertest(server).post('/').attach('package[0]', packageFilePath)
    assert.deepEqual(stack, ['before', 'after', 'ended'])
    assert.property(files, 'package')
    assert.isTrue(files!.package[0].isValid)
    assert.equal(files!.package[0].state, 'consumed')
    assert.equal(files!.package[0].size, packageFileSize)
  })

  test('pass file to wildcard handler when defined', async (assert) => {
    const stack: string[] = []
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('*', {}, async (part, reporter) => {
        part.on('data', reporter)

        stack.push('before')
        part.resume()
        await sleep(100)
        stack.push('after')
      })

      await multipart.process()
      files = request['__raw_files']
      stack.push('ended')
      res.end()
    })

    await supertest(server).post('/').attach('package', packageFilePath)
    assert.deepEqual(stack, ['before', 'after', 'ended'])
    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.equal(files!.package.size, packageFileSize)
  })

  test('collect fields automatically', async (assert) => {
    const stack: string[] = []
    let files: null | { [key: string]: File } = null
    let fields: null | { [key: string]: any } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('*', {}, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('data', reporter)
          part.on('error', reject)
          part.on('end', resolve)
          stack.push('file')
          part.resume()
        })
      })

      await multipart.process()
      files = request['__raw_files']
      fields = request.all()
      stack.push('ended')
      res.end()
    })

    await supertest(server)
      .post('/')
      .attach('package', packageFilePath)
      .field('name', 'virk')

    assert.deepEqual(stack, ['file', 'ended'])
    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.equal(files!.package.size, packageFileSize)
    assert.equal(files!.package.state, 'consumed')
    assert.deepEqual(fields, { name: 'virk' })
  })

  test('FIELDS: raise error when process is invoked multiple times', async (assert) => {
    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      try {
        await multipart.process()
        await multipart.process()
        res.end()
      } catch (error) {
        res.writeHead(500)
        res.end(error.message)
      }
    })

    const { text } = await supertest(server)
      .post('/')
      .field('name', 'virk')

    assert.equal(text, 'E_RUNTIME_EXCEPTION: multipart stream has already been consumed')
  })

  test('FIELDS: raise error when maxFields are crossed', async (assert) => {
    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1, limit: 4000 })

      try {
        await multipart.process()
        res.end()
      } catch (error) {
        res.writeHead(500)
        res.end(error.message)
      }
    })

    const { text } = await supertest(server)
      .post('/')
      .field('name', 'virk')
      .field('age', '22')

    assert.equal(text, 'E_REQUEST_ENTITY_TOO_LARGE: Max fields limit exceeded')
  })

  test('FIELDS: raise error when bytes limit is crossed', async (assert) => {
    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 2 })

      try {
        await multipart.process()
        res.end()
      } catch (error) {
        res.writeHead(500)
        res.end(error.message)
      }
    })

    const { text } = await supertest(server)
      .post('/')
      .field('name', 'virk')
      .field('age', '22')

    assert.equal(text, 'E_REQUEST_ENTITY_TOO_LARGE: request entity too large')
  })

  test('disrupt file uploads error when total bytes limit is crossed', async (assert) => {
    assert.plan(2)

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 20 })

      multipart.onFile('package', {}, (part, report) => {
        return new Promise((resolve, reject) => {
          part.on('error', (error) => {
            part.removeAllListeners()
            assert.equal(error.message, 'E_REQUEST_ENTITY_TOO_LARGE: request entity too large')
            reject(error)
          })

          part.on('data', report)
          part.on('end', resolve)
        })
      })

      try {
        await multipart.process()
        res.end()
      } catch (error) {
        res.writeHead(500)
        res.end(error.message)
      }
    })

    try {
      const { text } = await supertest(server)
        .post('/')
        .attach('package', packageFilePath)
        .field('name', 'virk')
        .field('age', '22')

      assert.equal(text, 'E_REQUEST_ENTITY_TOO_LARGE: request entity too large')
    } catch (error) {
      assert.oneOf(error.code, ['ECONNABORTED', 'ECONNRESET'])
    }
  })

  test('disrupt part streaming when validation fails', async (assert) => {
    let files: null | { [key: string]: File } = null
    assert.plan(5)

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('*', {
        size: 10,
      }, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('error', (error: any) => {
            assert.equal(error.code, 'E_STREAM_VALIDATION_FAILURE')
            reject(error)
          })
          part.on('end', resolve)
          part.on('data', reporter)
        })
      })

      await multipart.process()
      files = request['__raw_files'] || null
      res.end()
    })

    await supertest(server)
      .post('/')
      .attach('package', packageFilePath)

    assert.property(files, 'package')
    assert.isFalse(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.deepEqual(files!.package.errors, [{
      type: 'size',
      clientName: 'package.json',
      fieldName: 'package',
      message: 'File size should be less than 10B',
    }])
  })

  test('validate stream only once', async (assert) => {
    assert.plan(5)
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000 })

      multipart.onFile('*', { size: 10 }, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('error', (error: any) => {
            assert.equal(error.code, 'E_STREAM_VALIDATION_FAILURE')
            reject(error)
          })

          part.on('end', resolve)
          part.on('data', reporter)
        })
      })

      await multipart.process()
      files = request['__raw_files'] || null
      res.end()
    })

    await supertest(server)
      .post('/')
      .attach('profile', join(__dirname, '..', 'unicorn.png'))

    assert.property(files, 'profile')
    assert.isFalse(files!.profile.isValid)
    assert.equal(files!.profile.state, 'consumed')
    assert.deepEqual(files!.profile.errors, [{
      type: 'size',
      clientName: 'unicorn.png',
      fieldName: 'profile',
      message: 'File size should be less than 10B',
    }])
  })

  test('report extension validation errors', async (assert) => {
    assert.plan(4)

    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('*', {
        extnames: ['jpg'],
      }, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('error', reject)
          part.on('end', resolve)
          part.on('data', reporter)
        })
      })

      await multipart.process()
      files = request['__raw_files'] || null
      res.end()
    })

    await supertest(server)
      .post('/')
      .attach('package', packageFilePath)

    assert.property(files, 'package')
    assert.isFalse(files!.package.isValid)
    assert.equal(files!.package.state, 'consumed')
    assert.deepEqual(files!.package.errors, [{
      type: 'extname',
      clientName: 'package.json',
      fieldName: 'package',
      message: 'Invalid file extension json. Only jpg is allowed',
    }])
  })

  test('do not run validations when deferValidations is set to true', async (assert) => {
    let files: null | { [key: string]: File } = null

    const server = createServer(async (req, res) => {
      const request = new Request(req, res, encryption, requestConfig)
      const multipart = new Multipart(request, getLogger(), { maxFields: 1000, limit: 4000 })

      multipart.onFile('*', {
        size: 10,
        deferValidations: true,
      }, (part, reporter) => {
        return new Promise((resolve, reject) => {
          part.on('data', reporter)
          part.on('end', resolve)
          part.on('error', reject)
        })
      })

      await multipart.process()
      files = request['__raw_files'] || null
      res.end()
    })

    await supertest(server)
      .post('/')
      .attach('package', packageFilePath)

    assert.property(files, 'package')
    assert.isTrue(files!.package.isValid)
    assert.isFalse(files!.package.validated)
    assert.equal(files!.package.state, 'consumed')
    assert.equal(files!.package.extname, 'json')
    assert.deepEqual(files!.package.errors, [])
  })
})
