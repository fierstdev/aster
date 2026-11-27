import { COMP, SLOT, _comp, _slot, _tpl, html, type SlotBinding } from './runtime.ts';

type Value =
  | null
  | boolean
  | number
  | string
  | ['undefined']
  | ['array', Value[]]
  | ['object', [string, Value][]]
  | ['query', string]
  | ['date', string]
  | ['component', string, Value, Value]
  | ['callback', string]
  | ['template', string, readonly SlotBinding[], Value[], Value]
  | ['html', readonly string[], Value[]];

export class IslandValueError extends TypeError {}

/** Object entries and framework records are distinct, including user keys named "__proto__". */
export function encodeIslandValue(input: unknown, resolve: (src: string) => string): Value {
  const ancestors = new Set<object>();
  function encode(value: any, path: string): Value {
    if (value === undefined) return ['undefined'];
    if (typeof value === 'function' && typeof value.__asterOwnerSrc === 'string') {
      return ['callback', resolve(value.__asterOwnerSrc)];
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      Number.isFinite(value)
    )
      return value;
    if (typeof value !== 'object' || ancestors.has(value))
      throw new IslandValueError(
        `Cannot revive ${path}: expected data or a client component, received ${typeof value === 'function' ? 'a server closure' : 'an unsupported or cyclic value'}.`,
      );
    ancestors.add(value);
    try {
      const entries = (list: readonly unknown[]) => list.map((v, i) => encode(v, `${path}[${i}]`));
      if (Array.isArray(value)) return ['array', entries(value)];
      if (value instanceof URLSearchParams) return ['query', value.toString()];
      if (value instanceof Date && Number.isFinite(value.getTime()))
        return ['date', value.toISOString()];
      if (COMP in value) {
        const src = value.src ?? value[COMP].__asterOwnerSrc;
        if (!src)
          throw new IslandValueError(
            `Cannot revive ${path}: component has no client module export.`,
          );
        return [
          'component',
          resolve(src),
          encode(value.p, path + '.props'),
          encode(value.k, path + '.key'),
        ];
      }
      if (SLOT in value) {
        const tpl = value[SLOT];
        if (tpl.rawStrings) return ['html', tpl.rawStrings, entries(value.v)];
        return [
          'template',
          tpl.html,
          tpl.bindings,
          entries(value.v),
          encode(value.k, path + '.key'),
        ];
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== Object.prototype)
        throw new IslandValueError(`Cannot revive ${path}: expected a plain object.`);
      return ['object', Object.entries(value).map(([k, v]) => [k, encode(v, path + '.' + k)])];
    } finally {
      ancestors.delete(value);
    }
  }
  return encode(input, 'props');
}

export async function decodeIslandValue(value: Value): Promise<any> {
  if (!Array.isArray(value)) return value;
  switch (value[0]) {
    case 'undefined':
      return undefined;
    case 'array':
      return Promise.all(value[1].map(decodeIslandValue));
    case 'object':
      return Object.fromEntries(
        await Promise.all(value[1].map(async ([k, v]) => [k, await decodeIslandValue(v)])),
      );
    case 'query':
      return new URLSearchParams(value[1]);
    case 'date':
      return new Date(value[1]);
    case 'html':
      return html(
        value[1] as TemplateStringsArray,
        ...(await Promise.all(value[2].map(decodeIslandValue))),
      );
    case 'template':
      return _slot(
        _tpl(value[1], value[2]),
        await Promise.all(value[3].map(decodeIslandValue)),
        await decodeIslandValue(value[4]),
      );
    case 'callback':
      return loadExport(value[1]);
    case 'component': {
      const [fn, props, key] = await Promise.all([
        loadExport(value[1]),
        decodeIslandValue(value[2]),
        decodeIslandValue(value[3]),
      ]);
      return _comp(fn, props, key);
    }
    default:
      throw new TypeError('Unknown Aster island value');
  }
}

async function loadExport(spec: string) {
  const [url, name = 'default'] = spec.split(/#(.*)/s);
  const module = await import(/* @vite-ignore */ url);
  if (typeof module[name] !== 'function') throw new TypeError(`Missing client export in ${spec}`);
  return module[name];
}
