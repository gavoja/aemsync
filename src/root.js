import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

export default resolve(dirname(fileURLToPath(import.meta.url)), '..')
