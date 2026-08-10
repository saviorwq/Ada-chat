/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(here, 'alias-loader.mjs')).href)
