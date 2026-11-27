/**
 * DEOF Party Agent uploads -> Google Drive
 *
 * Deploy: script.google.com > New project > paste this file >
 *   Deploy > New deployment > Web app
 *     Execute as: Me
 *     Who has access: Anyone
 * Copy the Web app URL into VITE_AGENT_UPLOAD_URL.
 *
 * Each submission gets its own subfolder inside FOLDER_ID:
 *   "<LGA> - <Ward> - <Name> - <submissionId>"
 */

// ID of the Drive folder that will hold uploads (from its URL: drive.google.com/drive/folders/<THIS_PART>)
const FOLDER_ID = '1Ue0lF9qy0vJWm72bxHmzjmXloUOGzrUA'

// Must match VITE_AGENT_UPLOAD_KEY in the website's environment
const UPLOAD_KEY = 'PASTE_A_LONG_RANDOM_STRING_HERE'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function doGet() {
  return json_({ ok: true, service: 'deof-agent-uploads' })
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)

    if (body.key !== UPLOAD_KEY) return json_({ ok: false, error: 'Unauthorized' })

    const mimeType = String(body.mimeType || '')
    if (!(mimeType.indexOf('image/') === 0 || ALLOWED_TYPES.indexOf(mimeType) !== -1)) {
      return json_({ ok: false, error: 'File type not allowed: ' + (mimeType || 'unknown') })
    }

    const bytes = Utilities.base64Decode(String(body.data || ''))
    if (!bytes.length) return json_({ ok: false, error: 'Empty file' })
    if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'File is larger than 10 MB' })

    const folder = getOrCreateSubfolder_(clean_(body.folderName) || 'Unsorted')
    const blob = Utilities.newBlob(bytes, mimeType, clean_(body.fileName) || 'upload')
    const file = folder.createFile(blob)

    return json_({
      ok: true,
      id: file.getId(),
      url: file.getUrl(),
      folderUrl: folder.getUrl(),
    })
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) })
  }
}

function getOrCreateSubfolder_(name) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const parent = DriveApp.getFolderById(FOLDER_ID)
    const existing = parent.getFoldersByName(name)
    return existing.hasNext() ? existing.next() : parent.createFolder(name)
  } finally {
    lock.releaseLock()
  }
}

function clean_(value) {
  return String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150)
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

// Run this once from the editor (select it, click Run) to grant Drive permission and test the folder ID.
function testSetup() {
  const folder = DriveApp.getFolderById(FOLDER_ID)
  Logger.log('OK: uploads will go to "' + folder.getName() + '"')
}
