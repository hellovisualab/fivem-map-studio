import JSZip from 'jszip'
import { slugify } from '@/lib/utils'

export interface PropAsset {
  id: string
  name: string
  url: string
  file: File
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export async function exportPropResource(props: PropAsset[], resourceName: string) {
  const zip = new JSZip()
  const root = slugify(resourceName) || 'prop_pack'
  const folder = zip.folder(root)!
  const stream = folder.folder('stream')!

  for (const prop of props) {
    const safe = slugify(prop.name) || prop.id
    const ext = prop.file.name.split('.').pop()?.toLowerCase() || 'glb'
    stream.file(`${safe}.${ext}`, prop.file)
  }

  folder.file(
    'fxmanifest.lua',
    `fx_version 'cerulean'
game 'gta5'

name '${root}'
author 'FiveM Tools'
description 'Prop pack exported from FiveM Tools Prop Creator (GLB/OBJ MVP)'
version '1.0.0'

files {
  'stream/*'
}

-- Note: native .ydr conversion is on the roadmap.
-- For now this ships the source meshes under stream/ for tooling / custom pipelines.
`,
  )

  folder.file(
    'README.md',
    `# ${root}

Exported from **FiveM Tools · Prop Creator**.

## Contents
- \`stream/\` — your uploaded meshes (glb/obj/…)
- \`fxmanifest.lua\` — resource stub

## Important
Full GTA V \`.ydr\` + collision export is not included in this MVP. Use this pack as a working archive of authored transforms and source meshes, or convert with OpenIV / Sollumz / CodeWalker.

### Transforms (JSON)
See \`props.json\` for position / rotation / scale of each prop in the editor.
`,
  )

  folder.file(
    'props.json',
    JSON.stringify(
      {
        resource: root,
        props: props.map((p) => ({
          name: p.name,
          file: p.file.name,
          position: p.position,
          rotation: p.rotation,
          scale: p.scale,
        })),
      },
      null,
      2,
    ),
  )

  return zip.generateAsync({ type: 'blob' })
}
