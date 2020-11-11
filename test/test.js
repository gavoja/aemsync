'use strict'

const test = require('triala')
const path = require('path')
const aemsync = require('../index')
const assert = require('assert')

const COMPONENT = path.resolve(__dirname, 'jcr_root/apps/myapp/component')
const TARGET = 'http://admin:admin@localhost:1234'

test('aemsync', class {
  async _before () {
    this.pipeline = new aemsync.Pipeline({ targets: [TARGET] })
  }

  async _push (pathToPush) {
    const pack = await this.pipeline.push(pathToPush)
    return pack.zip.inspect()
  }

  //
  // Test cases start here.
  //

  async 'onPushEnd failure' () {
    const msg = 'Something went wrong'
    this.pipeline._post = (archivePath, target) => ({ err: new Error(msg), target })

    let error = null
    this.pipeline.onPushEnd = (err, target, log) => (error = err)

    await this.pipeline.push(COMPONENT)

    // Reset for the rest of the tests.
    this.pipeline.onPushEnd = () => {}
    this.pipeline._post = (archivePath, target) => ({ target })

    // Check if error message matches.
    assert.strictEqual(error.message, msg)
  }

  async 'exclude' () {
    const expected = { entries: [], filter: [''] }

    assert.deepStrictEqual(await this._push(path.join('jcr_root')), expected)
    assert.deepStrictEqual(await this._push(path.join('jcr_root', 'bar')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', 'jcr_root')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', 'jcr_root', 'bar')), expected)
    assert.deepStrictEqual(await this._push(path.join('.svn')), expected)
    assert.deepStrictEqual(await this._push(path.join('.hg')), expected)
    assert.deepStrictEqual(await this._push(path.join('.git')), expected)
    assert.deepStrictEqual(await this._push(path.join('target')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.svn')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.hg')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.git')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', 'target')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.svn', 'bar')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.hg', 'bar')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', '.git', 'bar')), expected)
    assert.deepStrictEqual(await this._push(path.join('foo', 'target', 'bar')), expected)
    assert.ok((await this._push(path.join('foo', 'jcr_root', 'bar', 'baz'))).entries.length > 0)
  }

  async '+ file.txt' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'jcr_root/apps/myapp/component/file.txt',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'file.txt'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'folder'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ sub-folder' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'folder', 'sub-folder'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ component, + file.xml, + .content.xml, + file-node.xml, - deleted.xml' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
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
        'jcr_root/apps/myapp/component/folder-node/.content.xml@nt:unstructured',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    let result = await this._push(path.join(COMPONENT))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, 'file.xml'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, '.content.xml'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, 'file-node.xml'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, 'deleted.xml'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node, + folder-node/.content.xml' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'jcr_root/apps/myapp/component/folder-node/',
        'jcr_root/apps/myapp/component/folder-node/.content.xml@nt:unstructured',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    let result = await this._push(path.join(COMPONENT, 'folder-node'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, 'folder-node', '.content.xml'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node-nested' () {
    const expected = {
      entries: [
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
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/file-node.xml',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'folder-node-nested'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ folder-node-nested/foo/bar/baz/file-node.xml' () {
    const expected = {
      entries: [
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
        'jcr_root/apps/myapp/component/folder-node-nested/foo/bar/baz/file-node.xml',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'folder-node-nested', 'foo', 'bar', 'baz', 'file-node.xml'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ _jcr_content, + _jcr_content/.content.xml, + _jcr_content/file-node.xml, - _jcr_content/deleted.xml' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'jcr_root/apps/myapp/component/_jcr_content/',
        'jcr_root/apps/myapp/component/_jcr_content/.content.xml@cq:PageContent',
        'jcr_root/apps/myapp/component/_jcr_content/file-node.xml',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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
    let result = await this._push(path.join(COMPONENT, '_jcr_content'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, '_jcr_content', 'file-node.xml'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, '_jcr_content', '.content.xml'))
    assert.deepStrictEqual(result, expected)

    result = await this._push(path.join(COMPONENT, '_jcr_content', 'deleted.xml'))
    assert.deepStrictEqual(result, expected)
  }

  async '- deleted' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
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

    const result = await this._push(path.join(COMPONENT, 'deleted'))
    assert.deepStrictEqual(result, expected)
  }

  async '+ _cq_design_dialog.xml' () {
    const expected = {
      entries: [
        'jcr_root/',
        'jcr_root/aemsync.txt',
        'jcr_root/apps/.content.xml@nt:folder',
        'jcr_root/apps/myapp/.content.xml@nt:folder',
        'jcr_root/apps/myapp/component/.content.xml@cq:Component',
        'META-INF/',
        'META-INF/vault/',
        'META-INF/vault/config.xml',
        'META-INF/vault/definition/',
        'META-INF/vault/definition/.content.xml@vlt:PackageDefinition',
        'META-INF/vault/filter.xml',
        'META-INF/vault/nodetypes.cnd',
        'META-INF/vault/properties.xml'
      ],
      filter: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workspaceFilter version="1.0">',
        '<filter root="/apps/myapp/component/cq:design_dialog" />',
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

    const result = await this._push(path.join(COMPONENT, '_cq_design_dialog'))
    assert.deepStrictEqual(result, expected)
  }
})
