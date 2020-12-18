/* eslint-disable no-await-in-loop, no-console, no-restricted-syntax */
import path from 'path'
import fsJet from 'fs-jetpack'
import isObject from 'is-plain-object'
import globby from 'globby'
import { bold, green, yellow } from 'colorette'

import { ensureTrailingNewLine, stringify } from './utils'

async function isFile(filePath) {
  const fileStats = await fsJet.inspectAsync(filePath)

  return fileStats.type === 'file'
}

function renameTarget(target, rename) {
  const parsedPath = path.parse(target)

  return typeof rename === 'string'
    ? rename
    : rename(parsedPath.name, parsedPath.ext.replace('.', ''))
}

async function generateCopyTarget(src, dest, file, { flatten, rename, transform }) {
  if (!(await isFile(src))) {
    if (transform) {
      throw new Error(`"transform" option works only on files: '${src}' must be a file`)
    }
    if (file) {
      throw new Error(`"file" option works only on files: '${src}' must be a file`)
    }
  }

  const { base, dir } = path.parse(src)
  let destination
  if (file) {
    // ignore the dest, flatten and rename
    destination = file
  } else {
    destination = flatten || (!flatten && !dir) ? dest : dir.replace(dir.split('/')[0], dest)
    destination = path.join(destination, rename ? renameTarget(base, rename) : base)
  }
  let contents
  if (file || transform) {
    contents = await fsJet.readAsync(src)
    if (transform) {
      contents = await transform(contents)
    }
  }

  return {
    src: src,
    dest: destination,
    contents: contents,
    renamed: !!rename,
    transformed: !!transform,
    merge: !!file
  }
}
/* eslint no-param-reassign: ["error", { "props": false }] */
function concatContents(targets) {
  const dests = []
  const indexes = []
  for (let index = 0; index < targets.length; index += 1) {
    if (targets[index].merge) {
      const i = dests.indexOf(targets[index].dest)
      if (i >= 0) {
        const mergeIndex = indexes[i]

        const target = targets[mergeIndex]
        target.contents = ensureTrailingNewLine(target.contents).concat(targets[index].contents)
        delete targets[index].contents
        delete targets[index].merge
      } else {
        dests.push(targets[index].dest)
        indexes.push(index)
      }
      targets[index].merged = true
    }
  }

  return targets
}
/* eslint no-param-reassign: ["error"] */

async function generateCopyTargets(srcs, dest, file, { flatten, rename, transform }) {
  const targets = await Promise.all(
    srcs.map((src) => generateCopyTarget(src, dest, file, { flatten, rename, transform }))
  )
  return concatContents(targets)
}

export default function copy(options = {}) {
  const {
    copyOnce = false,
    flatten = true,
    hook = 'buildEnd',
    targets = [],
    verbose = false,
    ...restPluginOptions
  } = options

  let copied = false

  return {
    name: 'copy',
    [hook]: async () => {
      if (copyOnce && copied) {
        return
      }

      const copyTargets = []

      if (Array.isArray(targets) && targets.length) {
        for (const target of targets) {
          if (!isObject(target)) {
            throw new Error(`${stringify(target)} target must be an object`)
          }

          const { dest, rename, src, transform, file, ...restTargetOptions } = target

          if (!src || (!dest && !file)) {
            throw new Error(`${stringify(target)} target must have "src" and "dest" properties`)
          }

          if (rename && typeof rename !== 'string' && typeof rename !== 'function') {
            throw new Error(
              `${stringify(target)} target's "rename" property must be a string or a function`
            )
          }

          const matchedPaths = await globby(src, {
            expandDirectories: false,
            onlyFiles: false,
            ...restPluginOptions,
            ...restTargetOptions
          })

          if (matchedPaths.length) {
            if (Array.isArray(dest)) {
              const targetsList = await Promise.all(
                dest.map((destination) =>
                  generateCopyTargets(matchedPaths, destination, file, {
                    flatten,
                    rename,
                    transform
                  })
                )
              )
              copyTargets.push(...targetsList.flat(1))
            } else {
              copyTargets.push(
                ...(await generateCopyTargets(matchedPaths, dest, file, {
                  flatten,
                  rename,
                  transform
                }))
              )
            }
          }
        }
      }

      if (copyTargets.length) {
        if (verbose) {
          console.log(green('copied:'))
        }

        for (const copyTarget of copyTargets) {
          const { src, contents, transformed, merge, merged, dest } = copyTarget

          if (transformed || merged) {
            if (merge || transformed) {
              await fsJet.writeAsync(dest, contents, restPluginOptions)
            }
          } else {
            await fsJet.copyAsync(src, dest, { overwrite: true, ...restPluginOptions })
          }

          if (verbose) {
            let message = green(`  ${bold(src)} → ${bold(dest)}`)
            const flags = Object.entries(copyTarget)
              .filter(([key, value]) => ['renamed', 'transformed', 'merged'].includes(key) && value)
              .map(([key]) => key.charAt(0).toUpperCase())

            if (flags.length) {
              message = `${message} ${yellow(`[${flags.join(', ')}]`)}`
            }

            console.log(message)
          }
        }
      } else if (verbose) {
        console.log(yellow('no items to copy'))
      }

      copied = true
    }
  }
}
