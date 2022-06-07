import util from 'node:util';

export default function stringify(value) {
  return util.inspect(value, { breakLength: Infinity });
}
