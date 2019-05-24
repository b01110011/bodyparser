/*
* @adonisjs/bodyparser
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

/// <reference path="../src/Contracts/index.ts" />
import { FileValidationOptions, MultipartFileContract, MultipartContract } from '@ioc:Adonis/Src/BodyParser'

declare module '@ioc:Adonis/Src/Request' {
  interface RequestContract {
    file (key: string, options?: Partial<FileValidationOptions>): MultipartFileContract,
    multipart: MultipartContract,
  }
}