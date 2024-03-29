import path from 'path';

import { bold, green, yellow } from 'colorette';
import fs from 'fs-extra';
import globby from 'globby';
import isPlainObject from 'is-plain-obj';

import { ensureTrailingNewLine, stringify, isFile } from './utils';

function renameTarget(target, rename, src) {
  const parsedPath = path.parse(target);

  return typeof rename === 'string'
    ? rename
    : rename(parsedPath.name, parsedPath.ext.replace('.', ''), src);
}

async function generateCopyTarget(src, dest, file, { flatten, rename, transform }) {
  if (!(await isFile(src))) {
    if (transform) {
      throw new Error(`"transform" option works only on files: '${src}' must be a file`);
    }
    if (file) {
      throw new Error(`"file" option works only on files: '${src}' must be a file`);
    }
  }

  const { base, dir } = path.parse(src);
  let destination;
  if (file) {
    // ignore the dest, flatten and rename
    destination = file;
  } else {
    destination = flatten || (!flatten && !dir) ? dest : dir.replace(dir.split('/')[0], dest);
    destination = path.join(destination, rename ? renameTarget(base, rename, src) : base);
  }
  let contents;
  if (file || transform) {
    contents = await fs.readFile(src, 'utf-8');
    if (transform) {
      contents = await transform(contents, base, src);
    }
  }

  return {
    src,
    dest: destination,
    contents,
    renamed: !!rename,
    transformed: !!transform,
    merge: !!file
  };
}

/* eslint no-param-reassign: ["error", { "props": false }] */
function concatContents(targets) {
  const dests = [];
  const indexes = [];
  for (let index = 0; index < targets.length; index += 1) {
    if (targets[index].merge) {
      const i = dests.indexOf(targets[index].dest);
      if (i >= 0) {
        const mergeIndex = indexes[i];

        const target = targets[mergeIndex];
        target.contents = ensureTrailingNewLine(target.contents).concat(targets[index].contents);
        delete targets[index].contents;
        delete targets[index].merge;
      } else {
        dests.push(targets[index].dest);
        indexes.push(index);
      }
      targets[index].merged = true;
    }
  }

  return targets;
}
/* eslint no-param-reassign: ["error"] */

async function generateCopyTargets(srcs, dest, file, { flatten, rename, transform }) {
  const targets = await Promise.all(
    srcs.map((src) => generateCopyTarget(src, dest, file, { flatten, rename, transform }))
  );
  return concatContents(targets);
}

export default function copyMerge(options = {}) {
  const {
    copyOnce = false,
    flatten = true,
    hook = 'buildEnd',
    targets = [],
    verbose = false,
    ...restPluginOptions
  } = options;

  let copied = false;

  return {
    name: 'copy',
    [hook]: async () => {
      if (copyOnce && copied) {
        return;
      }

      const copyTargets = [];

      if (Array.isArray(targets) && targets.length) {
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          if (!isPlainObject(target)) {
            throw new Error(`${stringify(target)} target must be an object`);
          }

          const { dest, rename, src, transform, file, ...restTargetOptions } = target;

          if (!src || (!dest && !file)) {
            throw new Error(`${stringify(target)} target must have "src" and "dest" properties`);
          }

          if (rename && typeof rename !== 'string' && typeof rename !== 'function') {
            throw new Error(
              `${stringify(target)} target's "rename" property must be a string or a function`
            );
          }

          const matchedPaths = await globby(src, {
            expandDirectories: false,
            onlyFiles: false,
            ...restPluginOptions,
            ...restTargetOptions
          });

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
              );
              targetsList.forEach((ts) => {
                copyTargets.push(...ts);
              });
            } else {
              const ts = await generateCopyTargets(matchedPaths, dest, file, {
                flatten,
                rename,
                transform
              });
              copyTargets.push(...ts);
            }
          }
        }
      }

      if (copyTargets.length) {
        if (verbose) {
          console.log(green('copied:'));
        }

        for (let index = 0; index < copyTargets.length; index += 1) {
          const copyTarget = copyTargets[index];
          const { src, contents, transformed, merged, dest } = copyTarget;

          if (transformed) {
            if (contents) await fs.outputFile(dest, contents);
          } else if (merged) {
            if (contents) await fs.outputFile(dest, contents);
          } else {
            await fs.copy(src, dest, { overwrite: true, errorOnExist: false, dereference: false });
          }

          if (verbose) {
            let message = green(`  ${bold(src)} → ${bold(dest)}`);
            const flags = Object.entries(copyTarget)
              .filter(([key, value]) => ['renamed', 'transformed', 'merged'].includes(key) && value)
              .map(([key]) => key.charAt(0).toUpperCase());

            if (flags.length) {
              message = `${message} ${yellow(`[${flags.join(', ')}]`)}`;
            }

            console.log(message);
          }
        }
      } else if (verbose) {
        console.log(yellow('no items to copy'));
      }

      copied = true;
    }
  };
}
