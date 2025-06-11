import fs from 'fs-extra'
import assert from 'node:assert'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { aemsync } from '../src/index.js'

const SAMPLE_CONTENT = path.resolve('./tests/data')
const TEMP = path.resolve('./temp')
const COMPONENT = path.resolve(TEMP, 'jcr_root/apps/myapp/component')

const results = []

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function watch (breakStuff) {
  fs.removeSync(TEMP)
  fs.copySync(SAMPLE_CONTENT, TEMP)
  const args = {
    workingDir: TEMP,
    postHandler: () => ({ target: 'http://test.local' }),
    breakStuff
  }

  for await (const result of aemsync(args)) {
    if (result) {
      const entry = result?.archive?.contents ?? null
      results.push(entry)
    }
  }
}

function add (subpath) {
  const fullPath = path.resolve(TEMP, subpath)
  if (fs.pathExistsSync(fullPath)) {
    fs.utimesSync(fullPath, new Date(), new Date())
  } else {
    const fileName = path.basename(fullPath).substring(1)
    fileName.includes('.') ? fs.createFileSync(fullPath) : fs.ensureDirSync(fullPath)
  }
}

function remove (subpath) {
  return fs.removeSync(path.resolve(TEMP, subpath))
}

async function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function expect (expected, message) {
  const start = Date.now()
  while (Date.now() - start < 1000) {
    const entry = results.at(-1)
    if (JSON.stringify(entry) === JSON.stringify(expected)) {
      return assert.deepStrictEqual(entry, expected, message)
    }

    await delay(50)
  }

  return assert.deepStrictEqual(results.at(-1), expected, message)
}

// -----------------------------------------------------------------------------
// Test cases
// -----------------------------------------------------------------------------

before(() => {
  watch()
})

after(() => {
  process.exit(0)
})

test('Excluded files and directories', async () => {
  add('jcr_root')
  add('jcr_root/bar')
  add('jcr_root/bar.txt')
  add('foo/jcr_root')
  add('foo/jcr_root/bar')
  add('foo/jcr_root/bar.txt')
  add('.svn')
  add('.hg')
  add('.git')
  add('target')
  add('foo/.svn')
  add('foo/.hg')
  add('foo/.git')
  add('foo/target')
  add('foo/.svn/bar')
  add('foo/.svn/bar.txt')
  add('foo/.hg/bar')
  add('foo/.hg/bar.txt')
  add('foo/.git/bar')
  add('foo/.git/bar.txt')
  add('foo/target/bar')
  add('foo/target/bar.txt')
  await expect(null)
})

test('+ file.txt', async () => {
  add(`${COMPONENT}/file.txt`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component',
      'jcr_root/apps/myapp/component/file.txt'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/file.txt" />',
      '<include pattern="/apps/myapp/component/file.txt/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/.content" />',
      '<include pattern="/apps/myapp/component/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '</workspaceFilter>'
    ]
  })
})

test('- file.txt', async () => {
  remove(`${COMPONENT}/file.txt`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp/component/file.txt" />',
      '',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/.content" />',
      '<include pattern="/apps/myapp/component/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '</workspaceFilter>'
    ]
  })
})

test('+ folder', async () => {
  add(`${COMPONENT}/folder`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component',
      'jcr_root/apps/myapp/component/folder/',
      'jcr_root/apps/myapp/component/folder/.content.xml@nt:folder'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/folder" />',
      '<include pattern="/apps/myapp/component/folder/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component/folder">',
      '<exclude pattern="/apps/myapp/component/folder/.*" />',
      '<include pattern="/apps/myapp/component/folder/.content" />',
      '<include pattern="/apps/myapp/component/folder/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/.content" />',
      '<include pattern="/apps/myapp/component/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '</workspaceFilter>'
    ]
  })
})

test('+ folder/sub-folder', async () => {
  add(`${COMPONENT}/folder/sub-folder`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component',
      'jcr_root/apps/myapp/component/folder/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/folder/sub-folder/',
      'jcr_root/apps/myapp/component/folder/sub-folder/.content.xml@nt:folder'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp/component/folder">',
      '<exclude pattern="/apps/myapp/component/folder/.*" />',
      '<include pattern="/apps/myapp/component/folder/sub-folder" />',
      '<include pattern="/apps/myapp/component/folder/sub-folder/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component/folder/sub-folder">',
      '<exclude pattern="/apps/myapp/component/folder/sub-folder/.*" />',
      '<include pattern="/apps/myapp/component/folder/sub-folder/.content" />',
      '<include pattern="/apps/myapp/component/folder/sub-folder/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component/folder">',
      '<exclude pattern="/apps/myapp/component/folder/.*" />',
      '<include pattern="/apps/myapp/component/folder/.content" />',
      '<include pattern="/apps/myapp/component/folder/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/.content" />',
      '<include pattern="/apps/myapp/component/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '</workspaceFilter>'
    ]
  })
})

test('- folder', async () => {
  remove(`${COMPONENT}/folder`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp/component">',
      '<exclude pattern="/apps/myapp/component/.*" />',
      '<include pattern="/apps/myapp/component/.content" />',
      '<include pattern="/apps/myapp/component/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp/component/folder" />',
      '</workspaceFilter>'
    ]
  })
})

test('+ component', async () => {
  add(COMPONENT)
  add(`${COMPONENT}/file.xml`)
  add(`${COMPONENT}/content.xml`)
  add(`${COMPONENT}/file-node.xml`)
  add(`${COMPONENT}/_cq_design_dialog.xml`)
  add(`${COMPONENT}/deleted.xml`)
  remove(`${COMPONENT}/deleted.xml`)
  await expect({
    entries: [
      'META-INF/',
      'META-INF/vault/',
      'META-INF/vault/config.xml',
      'META-INF/vault/definition/',
      'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
      'META-INF/vault/filter.xml',
      'META-INF/vault/nodetypes.cnd',
      'META-INF/vault/properties.xml',
      'jcr_root/',
      'jcr_root/aemsync.txt',
      'jcr_root/apps/.content.xml@nt:folder',
      'jcr_root/apps/myapp/.content.xml@nt:folder',
      'jcr_root/apps/myapp/component/',
      'jcr_root/apps/myapp/component/.content.xml@cq:Component',
      'jcr_root/apps/myapp/component/_cq_design_dialog.xml',
      'jcr_root/apps/myapp/component/_jcr_content/',
      'jcr_root/apps/myapp/component/_jcr_content/.content.xml@cq:PageContent',
      'jcr_root/apps/myapp/component/_jcr_content/file-node.xml',
      'jcr_root/apps/myapp/component/content.xml',
      'jcr_root/apps/myapp/component/file-node.xml',
      'jcr_root/apps/myapp/component/file.xml',
      'jcr_root/apps/myapp/component/folder-node-nested/',
      'jcr_root/apps/myapp/component/folder-node-nested/.content.xml@nt:unstructured',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/.content.xml@nt:unstructured',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/.content.xml@nt:unstructured',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/.content.xml@nt:unstructured',
      'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/file-node.xml',
      'jcr_root/apps/myapp/component/folder-node/',
      'jcr_root/apps/myapp/component/folder-node/.content.xml@nt:unstructured'
    ],
    filter: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workspaceFilter version="1.0">',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/component" />',
      '<include pattern="/apps/myapp/component/.*" />',
      '</filter>',
      '',
      '<filter root="/apps/myapp">',
      '<exclude pattern="/apps/myapp/.*" />',
      '<include pattern="/apps/myapp/.content" />',
      '<include pattern="/apps/myapp/.content/.*" />',
      '</filter>',
      '',
      '<filter root="/apps">',
      '<exclude pattern="/apps/.*" />',
      '<include pattern="/apps/.content" />',
      '<include pattern="/apps/.content/.*" />',
      '</filter>',
      '</workspaceFilter>'
    ]
  })
})
