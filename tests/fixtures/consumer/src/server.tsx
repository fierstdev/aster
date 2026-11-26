import { renderDocument, type RevivalManifest } from '@fierst/aster/ssr';
import { Panel } from './Panel';

export function page(manifest: RevivalManifest) {
  return renderDocument(<Panel label="SSR" />, { manifest });
}
