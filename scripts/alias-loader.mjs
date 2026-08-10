/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const abs = path.join(srcRoot, specifier.slice(2))
    return nextResolve(pathToFileURL(abs).href, context)
  }
  return nextResolve(specifier, context)
}
