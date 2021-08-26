'use strict'

module.exports = {
  workingDir: '.',
  exclude: ['**/jcr_root/*', '**/@(.git|.svn|.hg|target|install)', '**/@(.git|.svn|.hg|target|install)/**'],
  packmgrPath: '/crx/packmgr/service.jsp',
  targets: ['http://admin:admin@localhost:4502'],
  interval: 300,
  checkBeforeSend: false
}
