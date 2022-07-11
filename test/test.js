'use strict'

import assert from 'assert'
import path from 'path'
import test from 'triala'
import fs from 'fs'
import { push } from '../index.js'

const COMPONENT = path.resolve('./test/jcr_root/apps/myapp/component')

test('aemsync', class {
  // Push wrapper with overloaded POST handler.
  async _push (entry, breakStuff) {
    const payload = [entry]
    const args = { payload, breakStuff, postHandler: () => ({ target: 'http://test.local' }) }
    const results = []
    for await (const result of push(args)) {
      results.push(result)
    }

    return results.shift()?.archive?.contents
  }

  //
  // Test cases start here.
  //

  async 'exclude' () {
    const expected = undefined

    assert.deepStrictEqual(await this._push('jcr_root'), expected)
    assert.deepStrictEqual(await this._push('jcr_root/bar'), expected)
    assert.deepStrictEqual(await this._push('foo/jcr_root'), expected)
    assert.deepStrictEqual(await this._push('foo/jcr_root/bar'), expected)
    assert.deepStrictEqual(await this._push('.svn'), expected)
    assert.deepStrictEqual(await this._push('.hg'), expected)
    assert.deepStrictEqual(await this._push('.git'), expected)
    assert.deepStrictEqual(await this._push('target'), expected)
    assert.deepStrictEqual(await this._push('foo/.svn'), expected)
    assert.deepStrictEqual(await this._push('foo/.hg'), expected)
    assert.deepStrictEqual(await this._push('foo/.git'), expected)
    assert.deepStrictEqual(await this._push('foo/target'), expected)
    assert.deepStrictEqual(await this._push('foo/.svn/bar'), expected)
    assert.deepStrictEqual(await this._push('foo/.hg/bar'), expected)
    assert.deepStrictEqual(await this._push('foo/.git/bar'), expected)
    assert.deepStrictEqual(await this._push('foo/target/bar'), expected)
    assert.ok((await this._push('foo/jcr_root/bar/baz')).entries)
  }

  async '+ file.txt' () {
    const expected = {
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
    }

    const result = await this._push(`${COMPONENT}/file.txt`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder' () {
    const expected = {
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
        '<filter root="/apps/myapp/component/folder" />',
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
    }

    const result = await this._push(`${COMPONENT}/folder`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ sub-folder' () {
    const expected = {
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
        '<filter root="/apps/myapp/component/folder/sub-folder" />',
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
    }

    const result = await this._push(`${COMPONENT}/folder/sub-folder`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ component, + file.xml, + .content.xml, + file-node.xml, + cq_design_dialog.xml, - deleted.xml' () {
    const expected = {
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
        'jcr_root/apps/myapp/component/file-node.xml',
        'jcr_root/apps/myapp/component/file.txt',
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
    }

    let result = await this._push(COMPONENT)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/file.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/content.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/file-node.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/_cq_design_dialog.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/deleted.xml`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node, + folder-node/.content.xml' () {
    const expected = {
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
        'jcr_root/apps/myapp/component/folder-node/',
        'jcr_root/apps/myapp/component/folder-node/.content.xml@nt:unstructured'
      ],
      filter: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workspaceFilter version="1.0">',
        '<filter root="/apps/myapp/component">',
        '<exclude pattern="/apps/myapp/component/.*" />',
        '<include pattern="/apps/myapp/component/folder-node" />',
        '<include pattern="/apps/myapp/component/folder-node/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node">',
        '<exclude pattern="/apps/myapp/component/folder-node/.*" />',
        '<include pattern="/apps/myapp/component/folder-node/.content" />',
        '<include pattern="/apps/myapp/component/folder-node/.content/.*" />',
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
    }

    let result = await this._push(`${COMPONENT}/folder-node`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/folder-node/.content.xml`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node-nested' () {
    const expected = {
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
        'jcr_root/apps/myapp/component/folder-node-nested/',
        'jcr_root/apps/myapp/component/folder-node-nested/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/file-node.xml'
      ],
      filter: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workspaceFilter version="1.0">',
        '<filter root="/apps/myapp/component">',
        '<exclude pattern="/apps/myapp/component/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node-nested">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/.content" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/.content/.*" />',
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
    }

    const result = await this._push(`${COMPONENT}/folder-node-nested`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node-nested/foo/bar/baz/file-node.xml' () {
    const expected = {
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
        'jcr_root/apps/myapp/component/folder-node-nested/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/.content.xml@nt:unstructured',
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/file-node.xml'
      ],
      filter: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workspaceFilter version="1.0">',
        '<filter root="/apps/myapp/component/folder-node-nested/foo/bar">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/foo/bar/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/baz" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/baz/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node-nested/foo/bar/baz">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/foo/bar/baz/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/baz/.content" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/baz/.content/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node-nested/foo/bar">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/foo/bar/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/.content" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/bar/.content/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node-nested/foo">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/foo/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/.content" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/foo/.content/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/folder-node-nested">',
        '<exclude pattern="/apps/myapp/component/folder-node-nested/.*" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/.content" />',
        '<include pattern="/apps/myapp/component/folder-node-nested/.content/.*" />',
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
    }

    const result = await this._push(`${COMPONENT}/folder-node-nested/foo/bar/baz/file-node.xml`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ _jcr_content, + _jcr_content/.content.xml, + _jcr_content/file-node.xml, - _jcr_content/deleted.xml' () {
    const expected = {
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
        'jcr_root/apps/myapp/component/_jcr_content/',
        'jcr_root/apps/myapp/component/_jcr_content/.content.xml@cq:PageContent',
        'jcr_root/apps/myapp/component/_jcr_content/file-node.xml'
      ],
      filter: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workspaceFilter version="1.0">',
        '<filter root="/apps/myapp/component">',
        '<exclude pattern="/apps/myapp/component/.*" />',
        '<include pattern="/apps/myapp/component/jcr:content" />',
        '<include pattern="/apps/myapp/component/jcr:content/.*" />',
        '</filter>',
        '',
        '<filter root="/apps/myapp/component/_jcr_content">',
        '<exclude pattern="/apps/myapp/component/_jcr_content/.*" />',
        '<include pattern="/apps/myapp/component/_jcr_content/.content" />',
        '<include pattern="/apps/myapp/component/_jcr_content/.content/.*" />',
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
    }

    let result = await this._push(`${COMPONENT}/_jcr_content`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/_jcr_content/file-node.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/_jcr_content/.content.xml`)
    assert.deepStrictEqual(result, expected)

    result = await this._push(`${COMPONENT}/_jcr_content/deleted.xml`)
    assert.deepStrictEqual(result, expected)
  }

  async '- deleted' () {
    const expected = {
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
        '<filter root="/apps/myapp/component/deleted" />',
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
    }

    const result = await this._push(`${COMPONENT}/deleted`)
    assert.deepStrictEqual(result, expected)
  }

  async '+ new-file.txt, - new-file.txt' () {
    const expected = {
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
        '<filter root="/apps/myapp/component/new-file.txt" />',
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
    }

    // Create new file.
    const newFile = `${COMPONENT}/new-file.txt`
    fs.writeFileSync(newFile, 'new-file.txt')

    // Delete file before push.
    const result = await this._push(newFile, () => {
      if (fs.existsSync(newFile)) {
        fs.unlinkSync(newFile)
      }
    })

    assert.deepStrictEqual(result, expected)
  }
})
